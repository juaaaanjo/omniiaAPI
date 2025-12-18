const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const ExcelTransactionData = require('../models/ExcelTransactionData');

/**
 * Service for processing Excel transaction data from Excel uploads
 */
class ExcelTransactionService {
  /**
   * Parse and import Excel file containing transaction data
   * @param {Buffer} fileBuffer - Excel file buffer
   * @param {string} fileName - Original file name
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Import results
   */
  async importFromExcel(fileBuffer, fileName, userId) {
    try {
      logger.info('Starting Excel import', { fileName, userId });

      // Generate unique upload ID for this batch
      const uploadId = uuidv4();

      // Parse Excel file
      const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('No sheets found in Excel file');
      }

      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON (first row is headers)
      const rawData = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
        raw: false, // Get formatted values
        dateNF: 'yyyy-mm-dd',
      });

      if (rawData.length === 0) {
        throw new Error('No data found in Excel file');
      }

      logger.info(`Parsed ${rawData.length} rows from Excel`, { uploadId });

      // Process each row
      let importedCount = 0;
      let updatedCount = 0;
      let errorCount = 0;
      const errors = [];

      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const rowNumber = i + 2; // Excel row number (1-indexed + header row)

        try {
          // Transform row to database format
          const transactionData = this.transformExcelRow(row, userId, uploadId, fileName, rowNumber);

          // Upsert to database
          const result = await ExcelTransactionData.findOneAndUpdate(
            {
              userId,
              transactionId: transactionData.transactionId,
              uploadId,
            },
            transactionData,
            {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true,
            }
          );

          if (result.isNew) {
            importedCount++;
          } else {
            updatedCount++;
          }

        } catch (error) {
          logger.error('Error processing Excel row', {
            rowNumber,
            error: error.message,
          });
          errorCount++;
          errors.push({
            row: rowNumber,
            error: error.message,
          });

          // Stop if too many errors
          if (errors.length >= 50) {
            logger.error('Too many errors, stopping import');
            break;
          }
        }
      }

      const summary = {
        uploadId,
        fileName,
        totalRows: rawData.length,
        imported: importedCount,
        updated: updatedCount,
        errors: errorCount,
        errorDetails: errors,
        success: errorCount === 0,
      };

      logger.info('Excel import completed', summary);
      return summary;

    } catch (error) {
      logger.error('Error importing Excel file', {
        fileName,
        userId,
        error: error.message,
      });
      throw new Error(`Failed to import Excel file: ${error.message}`);
    }
  }

  /**
   * Transform Excel row to database format
   * @param {Object} row - Raw Excel row
   * @param {string} userId - User ID
   * @param {string} uploadId - Upload batch ID
   * @param {string} fileName - File name
   * @param {number} rowNumber - Row number in Excel
   * @returns {Object} Transformed transaction data
   */
  transformExcelRow(row, userId, uploadId, fileName, rowNumber) {
    // Helper function to parse numbers
    const parseNumber = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = parseFloat(String(value).replace(/,/g, ''));
      return isNaN(parsed) ? null : parsed;
    };

    // Helper function to parse dates
    const parseDate = (value) => {
      if (!value) return null;
      try {
        // If it's already a Date object from XLSX
        if (value instanceof Date) return value;

        // Try parsing string
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
      } catch {
        return null;
      }
    };

    // Helper function to parse boolean
    const parseBoolean = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'boolean') return value;
      const str = String(value).toLowerCase();
      return str === 'true' || str === '1' || str === 'yes' || str === 'sí';
    };

    // Helper to safely parse JSON
    const parseJSON = (value) => {
      if (!value) return null;
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        return value; // Return as-is if not valid JSON
      }
    };

    // Validate required fields
    if (!row.ID) {
      throw new Error('Missing required field: ID');
    }
    if (!row.lTotal && row.lTotal !== 0) {
      throw new Error('Missing required field: lTotal');
    }

    return {
      userId,
      uploadId,
      fileName,
      rowNumber,

      // Transaction identification
      transactionId: String(row.ID),
      idEmpresa: row.IDEmpresa ? String(row.IDEmpresa) : null,
      idPuntoDeVenta: row.IDPuntoDeVenta ? String(row.IDPuntoDeVenta) : null,
      idUsuario: row.IDUsuario ? String(row.IDUsuario) : null,
      idCliente: row.IDCliente ? String(row.IDCliente) : null,

      // Financial amounts
      total: parseNumber(row.lTotal),
      subTotal: parseNumber(row.lSubTotal),
      impuesto: parseNumber(row.lImpuesto),
      descuento: parseNumber(row.lDescuento),
      totalDescuento: parseNumber(row.lTotalDescuento),
      propina: parseNumber(row.Propina),
      abono: parseNumber(row.lAbono),

      // Payment methods
      efectivo: parseNumber(row.Efectivo),
      tarjeta: parseNumber(row.Tarjeta),
      tipoTarjeta: row.TipoTarjeta || null,

      // Business information
      nombreEmpresa: row.NombreEmpresa || null,
      nit: row.NIT ? String(row.NIT) : null,
      resolucionDIAN: row.ResolucionDIAN || null,

      // Location
      ciudad: row.Ciudad || null,
      departamento: row.Departamento || null,
      codigoDANE: row.CodigoDANE ? String(row.CodigoDANE) : null,
      direccion: row.Direccion || null,
      barrio: row.Barrio || null,
      dirPuntoDeVenta: row.DirPuntoDeVenta || null,
      barrioSede: row.BarrioSede || null,
      coordinates: {
        lat: parseNumber(row.lat),
        lng: parseNumber(row.lng),
      },

      // Customer information
      customer: {
        identificacion: row.Identificacion ? String(row.Identificacion) : null,
        nombre: row.Nombre || null,
        celular: row.Celular ? String(row.Celular) : null,
        telFijo: row.TelFijo ? String(row.TelFijo) : null,
        email: row.Email || null,
        fechaNacimiento: parseDate(row.FechaNacimiento),
      },

      // Transaction details
      factura: row.Factura || null,
      comanda: row.Comanda || null,
      estado: row.Estado || null,
      consecutivo: row.Consecutivo || null,
      prefijoImpuesto: row.PrefijoImpuesto || null,
      activo: parseBoolean(row.Activo),
      etiqueta: row.Etiqueta || null,
      etiquetaCliente: row.EtiquetaCliente || null,
      observacion: row.Observacion || null,

      // Employee
      empleado: row.Empleado || null,
      celEmpleado: row.CelEmpleado ? String(row.CelEmpleado) : null,

      // Point of sale details
      mesa: row.Mesa || null,
      sede: row.Sede || null,

      // Delivery
      delivery: {
        nombre: row.DeliveryNombre || null,
        descripcion: row.DeliveryDesc || null,
        celular: row.DeliveryCel ? String(row.DeliveryCel) : null,
        id: row.IDDelivery ? String(row.IDDelivery) : null,
      },

      // Agenda/Appointment
      agenda: {
        estado: row.Agenda_Estado || null,
        nombre: row.Agenda_Nombre || null,
        descripcion: row.Agenda_Desc || null,
        horaInicio: row.HoraInicio || null,
        horaFin: row.HoraFin || null,
      },

      // Electronic invoice (DIAN compliance)
      electronicInvoice: {
        number: row.FE_number || null,
        consecutivo: row.FE_Consecutivo || null,
        estado: row.FE_estado || null,
        cufe: row.FE_cufe || null,
        uuid: row.FE_uuid || null,
        urlPDF: row.FE_urlPDF || null,
        dataicoAccountId: row.FE_dataico_account_id || null,
        autKey: row.FE_autKey || null,
        jsonData: parseJSON(row.FE_json),
        dianStatus: row.dian_status || null,
        isElectronic: parseBoolean(row.FacturaElectronica),
        partyIdentificationType: row.fe_party_identification_type || null,
        partyType: row.fe_party_type || null,
        taxLevelCode: row.fe_tax_level_code || null,
        regimen: row.fe_regimen || null,
      },

      // Tax breakdown
      taxes: {
        totalICO: parseNumber(row.tax_ICO),
        totalIVA: parseNumber(row.tax_IVA),
        impICO: parseNumber(row.imp_ICO),
        impIVA: parseNumber(row.imp_IVA),
        imp: parseNumber(row.Imp),
      },

      // Products
      productos: parseJSON(row.Productos),
      productos1: parseJSON(row.Productos1),

      // Additional fields
      estadoWeb: row.EstadoWeb || null,
      fuente: row.Fuente || null,
      proveedor: row.Proveedor || null,
      rowId: row.RowID ? String(row.RowID) : null,
      configuracionPdeV: row.ConfiguracionPdeV || null,
      printQRDelivery: parseBoolean(row.printQR_delivery),
      cabezaFactura: row.CabezaFactura || null,
      pieFactura: row.PieFactura || null,

      // HTML representations
      htmlFactura: row.html_fac || null,
      htmlComanda: row.html_com || null,

      // Timestamps
      fechaCreacion: parseDate(row.fCreacion),
      fechaActualizacion: parseDate(row.fActualizacion),
      fechaPago: parseDate(row.fPago),

      // Sync metadata
      uploadedAt: new Date(),
    };
  }

  /**
   * Get statistics for an upload
   * @param {string} userId - User ID
   * @param {string} uploadId - Upload ID
   * @returns {Promise<Object>} Upload statistics
   */
  async getUploadStats(userId, uploadId) {
    try {
      const stats = await ExcelTransactionData.getUploadSummary(userId, uploadId);
      return stats;
    } catch (error) {
      logger.error('Error getting upload statistics', {
        userId,
        uploadId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get revenue summary for a date range
   * @param {string} userId - User ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Revenue summary
   */
  async getRevenueSummary(userId, startDate, endDate) {
    try {
      const summary = await ExcelTransactionData.getRevenueSummary(userId, startDate, endDate);
      return summary;
    } catch (error) {
      logger.error('Error getting revenue summary', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get daily revenue breakdown
   * @param {string} userId - User ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Daily revenue data
   */
  async getDailyRevenue(userId, startDate, endDate) {
    try {
      const dailyData = await ExcelTransactionData.getDailyRevenue(userId, startDate, endDate);
      return dailyData;
    } catch (error) {
      logger.error('Error getting daily revenue', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get payment method breakdown
   * @param {string} userId - User ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Payment method summary
   */
  async getPaymentMethodSummary(userId, startDate, endDate) {
    try {
      const summary = await ExcelTransactionData.getPaymentMethodSummary(userId, startDate, endDate);
      return summary;
    } catch (error) {
      logger.error('Error getting payment method summary', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get top customers
   * @param {string} userId - User ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {number} limit - Number of top customers
   * @returns {Promise<Array>} Top customers
   */
  async getTopCustomers(userId, startDate, endDate, limit = 10) {
    try {
      const customers = await ExcelTransactionData.getTopCustomers(userId, startDate, endDate, limit);
      return customers;
    } catch (error) {
      logger.error('Error getting top customers', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get revenue by location
   * @param {string} userId - User ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Revenue by location
   */
  async getRevenueByLocation(userId, startDate, endDate) {
    try {
      const data = await ExcelTransactionData.getRevenueByLocation(userId, startDate, endDate);
      return data;
    } catch (error) {
      logger.error('Error getting revenue by location', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get tax summary
   * @param {string} userId - User ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Tax summary
   */
  async getTaxSummary(userId, startDate, endDate) {
    try {
      const summary = await ExcelTransactionData.getTaxSummary(userId, startDate, endDate);
      return summary;
    } catch (error) {
      logger.error('Error getting tax summary', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all uploads for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} List of uploads with summaries
   */
  async getUserUploads(userId) {
    try {
      const uploads = await ExcelTransactionData.aggregate([
        { $match: { userId: userId } },
        {
          $group: {
            _id: '$uploadId',
            fileName: { $first: '$fileName' },
            uploadedAt: { $first: '$uploadedAt' },
            transactionCount: { $sum: 1 },
            totalRevenue: { $sum: '$total' },
            minDate: { $min: '$fechaCreacion' },
            maxDate: { $max: '$fechaCreacion' },
          },
        },
        { $sort: { uploadedAt: -1 } },
        {
          $project: {
            _id: 0,
            uploadId: '$_id',
            fileName: 1,
            uploadedAt: 1,
            transactionCount: 1,
            totalRevenue: 1,
            dateRange: {
              min: '$minDate',
              max: '$maxDate',
            },
          },
        },
      ]);

      return uploads;
    } catch (error) {
      logger.error('Error getting user uploads', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete an upload and all its transactions
   * @param {string} userId - User ID
   * @param {string} uploadId - Upload ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteUpload(userId, uploadId) {
    try {
      const result = await ExcelTransactionData.deleteMany({
        userId,
        uploadId,
      });

      logger.info('Upload deleted', {
        userId,
        uploadId,
        deletedCount: result.deletedCount,
      });

      return {
        success: true,
        deletedCount: result.deletedCount,
      };
    } catch (error) {
      logger.error('Error deleting upload', {
        userId,
        uploadId,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new ExcelTransactionService();
