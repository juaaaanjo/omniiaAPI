const smartRegisterService = require('../services/smartRegisterService');
const logger = require('../utils/logger');

/**
 * Start a new smart register session
 * @route POST /api/smart-register/start
 */
exports.startSession = async (req, res) => {
  try {
    const userId = req.user?._id || null;
    const session = await smartRegisterService.startSession(userId);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    logger.error(`Smart register start error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'No pudimos iniciar el registro inteligente.',
      error: error.message,
    });
  }
};

/**
 * Submit full form (non-chat) and create a completed session
 * @route POST /api/smart-register/form
 */
exports.submitForm = async (req, res) => {
  try {
    const userId = req.user?._id || null;
    const result = await smartRegisterService.submitForm(userId, req.validatedData);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Smart register form error: ${error.message}`);
    res.status(400).json({
      success: false,
      message: 'No pudimos registrar la información del formulario.',
      error: error.message,
    });
  }
};

/**
 * Submit an answer and get the next question
 * @route POST /api/smart-register/:sessionId/answer
 */
exports.submitAnswer = async (req, res) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    const { answer } = req.validatedData;

    const userId = req.user?._id || null;

    const result = await smartRegisterService.submitAnswer(userId, sessionId, answer);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Smart register answer error: ${error.message}`);
    const status = error.message.includes('No se encontró la sesión') ? 404 : 400;
    res.status(status).json({
      success: false,
      message: 'No pudimos registrar la respuesta.',
      error: error.message,
    });
  }
};

/**
 * Finish session: create/link user and mark completed
 * @route POST /api/smart-register/:sessionId/finish
 */
exports.finishSession = async (req, res) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    const { email, password, name } = req.validatedData;
    const userId = req.user?._id || null;

    const result = await smartRegisterService.finishSession({
      userId,
      sessionId,
      email,
      password,
      name,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Smart register finish error: ${error.message}`);
    const status = error.status
      || (error.message.includes('No se encontró la sesión') ? 404 : 400);
    res.status(status).json({
      success: false,
      message: 'No pudimos finalizar el registro.',
      error: error.message,
    });
  }
};

/**
 * Get session detail (progress + answers)
 * @route GET /api/smart-register/:sessionId
 */
exports.getSession = async (req, res) => {
  try {
    const sessionId = req.params.sessionId || req.query.sessionId;

    const userId = req.user?._id || null;

    const data = await smartRegisterService.getSession(userId, sessionId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error(`Smart register fetch error: ${error.message}`);
    res.status(404).json({
      success: false,
      message: 'No pudimos obtener la sesión solicitada.',
      error: error.message,
    });
  }
};

/**
 * List recent smart register sessions for a user
 * @route GET /api/smart-register
 */
exports.listSessions = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const sessions = await smartRegisterService.listSessions(
      req.user._id,
      parseInt(limit, 10)
    );

    res.json({
      success: true,
      data: {
        sessions,
        total: sessions.length,
      },
    });
  } catch (error) {
    logger.error(`Smart register list error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'No pudimos listar las sesiones.',
      error: error.message,
    });
  }
};
