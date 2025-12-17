const mongoose = require('mongoose');

/**
 * Excel Transaction Data Schema
 * Stores POS transaction data from Excel uploads (Colombian DIAN-compliant invoices)
 */
const excelTransactionDataSchema = new mongoose.Schema({
  // User reference (Nerdee user who uploaded the file)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Upload metadata
  uploadId: {
    type: String,
    required: true,
    index: true, // Groups transactions from same Excel file
  },
  fileName: {
    type: String,
    required: true,
  },
  rowNumber: {
    type: Number,
    required: true, // Original row number in Excel
  },

  // Transaction identification
  transactionId: {
    type: String, // ID from Excel
    required: true,
    index: true,
  },
  idEmpresa: String,
  idPuntoDeVenta: String,
  idUsuario: String,
  idCliente: String,

  // Financial amounts (Colombian Pesos - COP)
  total: {
    type: Number,
    required: true,
    index: true, // lTotal in Excel
  },
  subTotal: Number, // lSubTotal
  impuesto: Number, // lImpuesto - Total tax amount
  descuento: Number, // lDescuento - Discount percentage
  totalDescuento: Number, // lTotalDescuento - Total discount amount
  propina: Number, // Propina - Tip amount
  abono: Number, // lAbono - Advance payment

  // Payment methods
  efectivo: Number, // Cash payment amount
  tarjeta: Number, // Card payment amount
  tipoTarjeta: String, // Card type

  // Business information
  nombreEmpresa: String,
  nit: String, // Colombian tax ID
  resolucionDIAN: String, // DIAN resolution number

  // Location
  ciudad: String,
  departamento: String,
  codigoDANE: String, // Colombian municipality code
  direccion: String,
  barrio: String,
  dirPuntoDeVenta: String,
  barrioSede: String,
  coordinates: {
    lat: Number,
    lng: Number,
  },

  // Customer information
  customer: {
    identificacion: String, // ID number
    nombre: String,
    celular: String,
    telFijo: String,
    email: String,
    fechaNacimiento: Date,
  },

  // Transaction details
  factura: String, // Invoice number
  comanda: String, // Order ticket
  estado: {
    type: String,
    index: true,
  },
  consecutivo: String,
  prefijoImpuesto: String,
  activo: Boolean,
  etiqueta: String,
  etiquetaCliente: String,
  observacion: String,

  // Employee
  empleado: String,
  celEmpleado: String,

  // Point of sale details
  mesa: String, // Table number
  sede: String, // Branch/location

  // Delivery
  delivery: {
    nombre: String,
    descripcion: String,
    celular: String,
    id: String,
  },

  // Agenda/Appointment (if applicable)
  agenda: {
    estado: String,
    nombre: String,
    descripcion: String,
    horaInicio: String,
    horaFin: String,
  },

  // Electronic invoice (DIAN compliance - Colombian tax authority)
  electronicInvoice: {
    number: String, // FE_number
    consecutivo: String, // FE_Consecutivo
    estado: String, // FE_estado
    cufe: String, // FE_cufe - Unique code
    uuid: String, // FE_uuid
    urlPDF: String, // FE_urlPDF
    dataicoAccountId: String, // FE_dataico_account_id
    autKey: String, // FE_autKey
    jsonData: mongoose.Schema.Types.Mixed, // FE_json - Store parsed JSON
    dianStatus: String, // dian_status
    isElectronic: Boolean, // FacturaElectronica flag
    partyIdentificationType: String, // fe_party_identification_type
    partyType: String, // fe_party_type
    taxLevelCode: String, // fe_tax_level_code
    regimen: String, // fe_regimen
  },

  // Tax breakdown
  taxes: {
    totalICO: Number, // tax_ICO - Consumption tax
    totalIVA: Number, // tax_IVA - VAT
    impICO: Number, // imp_ICO
    impIVA: Number, // imp_IVA
    imp: Number, // Imp - Total tax
  },

  // Products
  productos: mongoose.Schema.Types.Mixed, // Store product details (could be JSON or text)
  productos1: mongoose.Schema.Types.Mixed, // Alternative products field

  // Additional fields
  estadoWeb: String,
  fuente: String, // Data source
  proveedor: String, // Provider
  rowId: String,
  configuracionPdeV: String, // Point of sale configuration
  printQRDelivery: Boolean,
  cabezaFactura: String, // Invoice header
  pieFactura: String, // Invoice footer

  // HTML representations
  htmlFactura: String, // html_fac
  htmlComanda: String, // html_com

  // Timestamps from POS system
  fechaCreacion: {
    type: Date,
    index: true, // fCreacion
  },
  fechaActualizacion: Date, // fActualizacion
  fechaPago: Date, // fPago

  // Sync metadata
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt
});

// Compound indexes for common queries
excelTransactionDataSchema.index({ userId: 1, fechaCreacion: -1 });
excelTransactionDataSchema.index({ userId: 1, estado: 1, fechaCreacion: -1 });
excelTransactionDataSchema.index({ userId: 1, uploadId: 1 });
excelTransactionDataSchema.index({ userId: 1, nombreEmpresa: 1 });
excelTransactionDataSchema.index({ userId: 1, 'customer.identificacion': 1 });

// Ensure unique transaction per user (combination of transactionId and uploadId)
excelTransactionDataSchema.index({ userId: 1, transactionId: 1, uploadId: 1 }, { unique: true });

/**
 * Get revenue summary for a date range
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Revenue summary
 */
excelTransactionDataSchema.statics.getRevenueSummary = async function(userId, startDate, endDate) {
  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
    fechaCreacion: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  };

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$total' },
        totalSubTotal: { $sum: { $ifNull: ['$subTotal', 0] } },
        totalImpuesto: { $sum: { $ifNull: ['$impuesto', 0] } },
        totalDescuento: { $sum: { $ifNull: ['$totalDescuento', 0] } },
        totalPropina: { $sum: { $ifNull: ['$propina', 0] } },
        totalCash: { $sum: { $ifNull: ['$efectivo', 0] } },
        totalCard: { $sum: { $ifNull: ['$tarjeta', 0] } },
        totalTransactions: { $sum: 1 },
        avgTicket: { $avg: '$total' },
      },
    },
  ]);

  if (result.length === 0) {
    return {
      totalRevenue: 0,
      totalSubTotal: 0,
      totalImpuesto: 0,
      totalDescuento: 0,
      totalPropina: 0,
      totalCash: 0,
      totalCard: 0,
      totalTransactions: 0,
      avgTicket: 0,
    };
  }

  return result[0];
};

/**
 * Get daily revenue breakdown
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Daily revenue data
 */
excelTransactionDataSchema.statics.getDailyRevenue = async function(userId, startDate, endDate) {
  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
    fechaCreacion: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  };

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$fechaCreacion' },
        },
        dailyRevenue: { $sum: '$total' },
        transactionCount: { $sum: 1 },
        cashPayments: { $sum: { $ifNull: ['$efectivo', 0] } },
        cardPayments: { $sum: { $ifNull: ['$tarjeta', 0] } },
        avgTicket: { $avg: '$total' },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        date: '$_id',
        revenue: '$dailyRevenue',
        transactionCount: 1,
        cashPayments: 1,
        cardPayments: 1,
        avgTicket: 1,
      },
    },
  ]);

  return result;
};

/**
 * Get payment method breakdown
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Payment method summary
 */
excelTransactionDataSchema.statics.getPaymentMethodSummary = async function(userId, startDate, endDate) {
  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
    fechaCreacion: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  };

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalCash: { $sum: { $ifNull: ['$efectivo', 0] } },
        totalCard: { $sum: { $ifNull: ['$tarjeta', 0] } },
        cashTransactions: {
          $sum: {
            $cond: [{ $gt: ['$efectivo', 0] }, 1, 0],
          },
        },
        cardTransactions: {
          $sum: {
            $cond: [{ $gt: ['$tarjeta', 0] }, 1, 0],
          },
        },
      },
    },
  ]);

  if (result.length === 0) {
    return {
      totalCash: 0,
      totalCard: 0,
      cashTransactions: 0,
      cardTransactions: 0,
    };
  }

  return result[0];
};

/**
 * Get top customers by revenue
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {number} limit - Number of top customers to return
 * @returns {Promise<Array>} Top customers
 */
excelTransactionDataSchema.statics.getTopCustomers = async function(userId, startDate, endDate, limit = 10) {
  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
    fechaCreacion: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
    'customer.identificacion': { $exists: true, $ne: null },
  };

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$customer.identificacion',
        customerName: { $first: '$customer.nombre' },
        customerEmail: { $first: '$customer.email' },
        customerPhone: { $first: '$customer.celular' },
        totalRevenue: { $sum: '$total' },
        transactionCount: { $sum: 1 },
        avgTicket: { $avg: '$total' },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        customerId: '$_id',
        customerName: 1,
        customerEmail: 1,
        customerPhone: 1,
        totalRevenue: 1,
        transactionCount: 1,
        avgTicket: 1,
      },
    },
  ]);
};

/**
 * Get transactions by location/sede
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Revenue by location
 */
excelTransactionDataSchema.statics.getRevenueByLocation = async function(userId, startDate, endDate) {
  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
    fechaCreacion: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  };

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$sede',
        totalRevenue: { $sum: '$total' },
        transactionCount: { $sum: 1 },
        avgTicket: { $avg: '$total' },
      },
    },
    { $sort: { totalRevenue: -1 } },
    {
      $project: {
        _id: 0,
        location: '$_id',
        totalRevenue: 1,
        transactionCount: 1,
        avgTicket: 1,
      },
    },
  ]);
};

/**
 * Get tax summary
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Tax summary
 */
excelTransactionDataSchema.statics.getTaxSummary = async function(userId, startDate, endDate) {
  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
    fechaCreacion: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  };

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalIVA: { $sum: { $ifNull: ['$taxes.totalIVA', 0] } },
        totalICO: { $sum: { $ifNull: ['$taxes.totalICO', 0] } },
        totalTax: { $sum: { $ifNull: ['$impuesto', 0] } },
        transactionCount: { $sum: 1 },
      },
    },
  ]);

  if (result.length === 0) {
    return {
      totalIVA: 0,
      totalICO: 0,
      totalTax: 0,
      transactionCount: 0,
    };
  }

  return result[0];
};

/**
 * Get upload summary (stats for a specific Excel upload)
 * @param {string} userId - User ID
 * @param {string} uploadId - Upload ID
 * @returns {Promise<Object>} Upload summary
 */
excelTransactionDataSchema.statics.getUploadSummary = async function(userId, uploadId) {
  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
    uploadId,
  };

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        fileName: { $first: '$fileName' },
        uploadedAt: { $first: '$uploadedAt' },
        totalTransactions: { $sum: 1 },
        totalRevenue: { $sum: '$total' },
        dateRange: {
          min: { $min: '$fechaCreacion' },
          max: { $max: '$fechaCreacion' },
        },
      },
    },
  ]);

  if (result.length === 0) {
    return null;
  }

  return result[0];
};

const ExcelTransactionData = mongoose.model('ExcelTransactionData', excelTransactionDataSchema);

module.exports = ExcelTransactionData;
