const SmartRegister = require('../models/SmartRegister');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Smart Register Service
 * Manages the Q&A flow used by the frontend chat to collect onboarding data
 */
class SmartRegisterService {
  constructor() {
    this.questions = [
      {
        key: 'company.identity.businessName',
        prompt: 'Nombre legal de la empresa.',
      },
      {
        key: 'company.identity.taxId',
        prompt: 'NIT/EIN o número fiscal.',
      },
      {
        key: 'company.identity.country',
        prompt: 'País donde opera la empresa.',
      },
      {
        key: 'company.identity.city',
        prompt: 'Ciudad principal.',
      },
      {
        key: 'company.identity.timezone',
        prompt: 'Huso horario.',
      },
      {
        key: 'company.identity.currency',
        prompt: 'Moneda base.',
      },
      {
        key: 'company.industry',
        prompt: 'Sector y sub-vertical (por ejemplo: retail, hotelería, restaurantes, servicios bajo demanda).',
      },
      {
        key: 'company.size.foundationYear',
        prompt: 'Año de fundación.',
      },
      {
        key: 'company.size.employeeCount',
        prompt: 'Número de empleados.',
      },
      {
        key: 'company.structure',
        prompt: 'Estructura organizacional (organigrama resumido).',
      },
      {
        key: 'company.stakeholders',
        prompt: 'Dueños, socios o stakeholders principales.',
      },
      {
        key: 'company.purpose.mission',
        prompt: 'Misión de la empresa.',
      },
      {
        key: 'company.purpose.vision',
        prompt: 'Visión de la empresa.',
      },
      {
        key: 'company.purpose.values',
        prompt: 'Valores (menciona los principales).',
      },
      {
        key: 'company.objectives',
        prompt: 'Principales objetivos estratégicos para los próximos 12 – 24 meses.',
      },
      {
        key: 'company.differentiators',
        prompt: 'Diferenciadores en el mercado (propuesta de valor única).',
      },
      {
        key: 'company.challenges',
        prompt: 'Retos actuales o “dolores” del negocio.',
      },
      {
        key: 'businessModel.product',
        prompt: 'Descripción del producto/servicio principal.',
      },
      {
        key: 'businessModel.revenue',
        prompt: 'Estructura de ingresos (ventas directas, suscripciones, servicios, licencias, etc.).',
      },
      {
        key: 'businessModel.channels',
        prompt: 'Canales de venta (físico, e-commerce, app, marketplaces, distribuidores).',
      },
      {
        key: 'businessModel.ticket.average',
        prompt: 'Ticket promedio.',
      },
      {
        key: 'businessModel.ticket.frequency',
        prompt: 'Frecuencia de compra.',
      },
      {
        key: 'businessModel.ticket.segments',
        prompt: 'Segmentos de clientes.',
      },
      {
        key: 'businessModel.costs',
        prompt: 'Principales costos operativos.',
      },
      {
        key: 'businessModel.margin.average',
        prompt: 'Margen promedio.',
      },
      {
        key: 'businessModel.margin.expectedProfitability',
        prompt: 'Rentabilidad esperada.',
      },
      {
        key: 'setupIq.goals',
        prompt: 'Objetivos concretos medibles (ROAS, CPA, NPS, FRT, payback, forecast de caja).',
      },
      {
        key: 'setupIq.indicators',
        prompt: 'Indicadores críticos de éxito por área.',
      },
      {
        key: 'setupIq.autonomy',
        prompt: 'Nivel de autonomía esperado para Nerdee (N0–N4).',
      },
      {
        key: 'setupIq.causalityChallenge',
        prompt: '[NUEVA] Principal Reto de Causalidad: ¿Cuál es el KPI más importante para el negocio y cómo prueban hoy que una acción específica fue la causa directa de su movimiento (Ej. ¿Cómo sabes que la campaña X causó el aumento y no la temporada)?',
      },
      {
        key: 'setupIq.certaintyVision',
        prompt: '[NUEVA] Visión de Certeza: En una escala del 1 al 10, ¿qué tan seguro está el liderazgo de que las 3 decisiones más grandes del último trimestre fueron las correctas?',
      },
    ];
  }

  generateSessionId() {
    return `register_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  getQuestion(step) {
    return this.questions[step] || null;
  }

  /**
   * Start a new smart register session for the user
   */
  async startSession(userId = null) {
    const sessionId = this.generateSessionId();

    const register = await SmartRegister.create({
      userId,
      sessionId,
      status: 'in_progress',
      currentStep: 0,
      totalQuestions: this.questions.length,
    });

    logger.info(`Smart register session ${sessionId} started for user ${userId}`);

    return {
      sessionId,
      registerId: register._id,
      totalQuestions: this.questions.length,
      currentStep: register.currentStep,
      nextQuestion: this.getQuestion(register.currentStep),
    };
  }

  /**
   * Submit an answer and get the next question (if any)
   */
  async submitAnswer(userId, sessionId, answer) {
    const register = await SmartRegister.findOne({ sessionId });

    if (!register) {
      throw new Error('No se encontró la sesión de registro.');
    }

    // If the session is linked to a user, enforce ownership
    if (register.userId) {
      if (!userId || register.userId.toString() !== userId.toString()) {
        throw new Error('Esta sesión pertenece a otro usuario.');
      }
    }

    const currentQuestion = this.getQuestion(register.currentStep);

    if (!currentQuestion) {
      throw new Error('Ya se respondieron todas las preguntas.');
    }

    register.answers.push({
      key: currentQuestion.key,
      question: currentQuestion.prompt,
      answer,
    });

    register.currentStep += 1;

    if (register.currentStep >= this.questions.length) {
      register.status = 'completed';
      register.completedAt = new Date();
    }

    await register.save();

    const nextQuestion = this.getQuestion(register.currentStep);
    const completed = register.status === 'completed';
    const progress = register.totalQuestions === 0
      ? 0
      : Math.min(register.currentStep / register.totalQuestions, 1);

    return {
      completed,
      progress,
      nextQuestion: completed ? null : nextQuestion,
      register,
    };
  }

  /**
   * Get a specific session for the user
   */
  async getSession(userId, sessionId) {
    const register = await SmartRegister.findOne({ sessionId });

    if (!register) {
      throw new Error('No se encontró la sesión solicitada.');
    }

    // If the session is linked to a user, enforce ownership
    if (register.userId) {
      if (!userId || register.userId.toString() !== userId.toString()) {
        throw new Error('Esta sesión pertenece a otro usuario.');
      }
    }

    return {
      register,
      nextQuestion: register.status === 'completed'
        ? null
        : this.getQuestion(register.currentStep),
    };
  }

  /**
   * List recent sessions for the user
   */
  async listSessions(userId, limit = 10) {
    return SmartRegister.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Finish session: create or link user and mark session completed
   */
  async finishSession({ userId = null, sessionId, email, password, name }) {
    const register = await SmartRegister.findOne({ sessionId });

    if (!register) {
      const err = new Error('No se encontró la sesión solicitada.');
      err.status = 404;
      throw err;
    }

    // If the session is linked to a user, enforce ownership
    if (register.userId) {
      if (userId && register.userId.toString() !== userId.toString()) {
        const err = new Error('Esta sesión pertenece a otro usuario.');
        err.status = 403;
        throw err;
      }
      userId = register.userId; // lock to existing owner
    }

    let user;
    const answers = Array.isArray(register.answers) ? register.answers : [];

    if (userId) {
      user = await User.findById(userId);
      if (!user) {
        const err = new Error('Usuario no encontrado.');
        err.status = 404;
        throw err;
      }

      if (!user.isActive) {
        const err = new Error('La cuenta está desactivada.');
        err.status = 401;
        throw err;
      }
    } else {
      // No authenticated user: create or validate existing
      user = await User.findOne({ email }).select('+password');

      if (user) {
        if (!user.isActive) {
          const err = new Error('La cuenta está desactivada.');
          err.status = 401;
          throw err;
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
          const err = new Error('El email ya está registrado. Inicia sesión o usa otro email.');
          err.status = 409;
          throw err;
        }
      } else {
        // Try to use business name as company/name fallback
        const identityAnswer = answers.find(a => a.key === 'company.identity.businessName');
        const fallbackName = name || identityAnswer?.answer || 'Usuario';
        const safeName = fallbackName.length >= 2 ? fallbackName : 'Usuario';
        const companyName = identityAnswer?.answer || undefined;

        user = new User({
          email,
          password,
          name: safeName,
          company: companyName,
          language: 'es',
        });

        await user.save();
      }
    }

    // Attach session to user and complete it
    register.userId = register.userId || user._id;
    register.status = 'completed';
    register.completedAt = register.completedAt || new Date();
    await register.save();

    const token = generateToken(user._id);

    return {
      user: user.toSafeObject(),
      token,
      register,
    };
  }

  /**
   * Create/register a session from a full form submission (non-chat)
   */
  async submitForm(userId = null, payload) {
    const sessionId = this.generateSessionId();

    const fields = [
      {
        field: 'industry',
        key: 'company.industry.sector',
        question: '¿A qué se dedica tu empresa?',
      },
      {
        field: 'subVertical',
        key: 'company.industry.subVertical',
        question: 'Sub-vertical',
      },
      {
        field: 'objective',
        key: 'company.objectives.primary',
        question: '¿Qué te gustaría lograr?',
      },
      {
        field: 'foundationYear',
        key: 'company.size.foundationYear',
        question: 'Año de fundación',
      },
      {
        field: 'employeeCount',
        key: 'company.size.employeeCount',
        question: 'Número de empleados',
      },
      {
        field: 'businessName',
        key: 'company.identity.businessName',
        question: 'Nombre legal de la empresa',
      },
      {
        field: 'taxId',
        key: 'company.identity.taxId',
        question: 'NIT/EIN o número fiscal',
      },
      {
        field: 'country',
        key: 'company.identity.country',
        question: 'País',
      },
      {
        field: 'city',
        key: 'company.identity.city',
        question: 'Ciudad',
      },
      {
        field: 'timezone',
        key: 'company.identity.timezone',
        question: 'Huso horario',
      },
      {
        field: 'currency',
        key: 'company.identity.currency',
        question: 'Moneda base',
      },
      {
        field: 'areasMonitored',
        key: 'operations.areasMonitored',
        question: '¿Qué áreas quieres monitorear?',
      },
      {
        field: 'teams',
        key: 'operations.teams',
        question: '¿Qué equipos tienes?',
      },
      {
        field: 'systems',
        key: 'integrations.desiredSystems',
        question: '¿Qué sistemas quieres conectar?',
      },
      {
        field: 'metrics',
        key: 'metrics.priorities',
        question: '¿Qué métricas son importantes para ti?',
      },
      {
        field: 'alerts',
        key: 'guardrails.alerts',
        question: '¿Qué alertas quieres recibir?',
      },
    ];

    const answers = fields
      .map(({ field, key, question }) => {
        const val = payload[field];
        if (val === undefined || val === null) return null;

        let stringVal;
        if (Array.isArray(val)) {
          const filtered = val.map(v => `${v}`.trim()).filter(Boolean);
          if (filtered.length === 0) return null;
          stringVal = filtered.join(', ');
        } else {
          stringVal = `${val}`.trim();
        }

        if (!stringVal) return null;
        return {
          key,
          question,
          answer: stringVal,
          answeredAt: new Date(),
        };
      })
      .filter(Boolean);

    const register = await SmartRegister.create({
      userId,
      sessionId,
      status: 'completed',
      currentStep: answers.length,
      totalQuestions: answers.length,
      answers,
      completedAt: new Date(),
    });

    logger.info(`Smart register form session ${sessionId} created for user ${userId}`);

    return {
      sessionId,
      registerId: register._id,
      completed: true,
      totalQuestions: answers.length,
      currentStep: answers.length,
      answers,
    };
  }
}

module.exports = new SmartRegisterService();
