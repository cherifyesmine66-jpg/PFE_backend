const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

/**
 * Generate an attestation PDF and save to /uploads.
 *
 * @param {object}  opts
 * @param {string}  opts.type          – 'WORK' or 'SALARY'
 * @param {object}  opts.employee      – { firstName, lastName, matricule, email, service, department, dob }
 * @param {number} [opts.salary]       – Required for SALARY type
 * @param {string}  opts.generatedBy   – "FirstName LastName" of RH user
 * @param {Date}   [opts.date]         – Date of generation (defaults to now)
 * @returns {Promise<string>}          – Filename of the generated PDF (relative to /uploads)
 */
async function generateAttestationPDF(opts) {
    const {
        type,
        employee,
        salary,
        generatedBy,
        date = new Date(),
    } = opts;

    const isSalary = type === 'SALARY';
    const title = isSalary ? 'ATTESTATION DE SALAIRE' : 'ATTESTATION DE TRAVAIL';
    const fullName = `${employee.firstName} ${employee.lastName}`;
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Unique filename
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `attestation_${type.toLowerCase()}_${hash}.pdf`;
    const filePath = path.join(UPLOADS_DIR, filename);

    // Ensure uploads dir exists
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 60 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // ─── Header ───
        doc.fontSize(11).fillColor('#666')
            .text('STIR — Direction des Ressources Humaines', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor('#999')
            .text('Société Tunisienne des Industries de Raffinage', { align: 'center' });
        doc.moveDown(2);

        // ─── Title ───
        doc.fontSize(18).fillColor('#2d3250').font('Helvetica-Bold')
            .text(title, { align: 'center', underline: true });
        doc.moveDown(2);

        // ─── Body ───
        doc.fontSize(12).fillColor('#333').font('Helvetica');

        doc.text('Nous soussignés, la Direction des Ressources Humaines de la STIR, certifions par la présente que :');
        doc.moveDown(1);

        doc.font('Helvetica-Bold').text(`M./Mme ${fullName}`, { continued: false });
        doc.font('Helvetica');

        if (employee.matricule) {
            doc.text(`Matricule : ${employee.matricule}`);
        }
        if (employee.service) {
            doc.text(`Service : ${employee.service}`);
        }
        if (employee.department) {
            doc.text(`Département : ${employee.department}`);
        }

        doc.moveDown(1);
        doc.text('est bien employé(e) au sein de notre société à la date de ce document.');

        if (isSalary && salary != null) {
            doc.moveDown(1);
            const formattedSalary = salary.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
            doc.text(`Son salaire mensuel brut s'élève à : `, { continued: true });
            doc.font('Helvetica-Bold').text(`${formattedSalary} TND`, { continued: false });
            doc.font('Helvetica');
        }

        doc.moveDown(1);
        doc.text('La présente attestation est délivrée à l\'intéressé(e) pour servir et valoir ce que de droit.');

        doc.moveDown(3);

        // ─── Signature block ───
        doc.text(`Fait à Tunis, le ${dateStr}`, { align: 'right' });
        doc.moveDown(2);
        doc.font('Helvetica-Bold').text('Direction des Ressources Humaines', { align: 'right' });
        doc.font('Helvetica').text(`Établi par : ${generatedBy}`, { align: 'right' });

        // ─── Digital signature stamp ───
        doc.moveDown(2);
        const sigHash = crypto.createHash('sha256')
            .update(`${fullName}|${type}|${dateStr}|${generatedBy}`)
            .digest('hex')
            .substring(0, 16)
            .toUpperCase();

        doc.fontSize(8).fillColor('#999')
            .text(`Signature numérique : ${sigHash}`, { align: 'center' });
        doc.text(`Document généré le ${dateStr} — Ce document fait foi.`, { align: 'center' });

        doc.end();

        stream.on('finish', () => resolve(filename));
        stream.on('error', reject);
    });
}

module.exports = { generateAttestationPDF };
