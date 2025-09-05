// const PdfPrinter = require('pdfmake');
// const path = require('path');

// const fonts = {
//   Roboto: {
//     normal: path.join(__dirname, '../public/assets/font/Roboto-Regular.ttf'),
//     bold: path.join(__dirname, '../public/assets/font/Roboto-Medium.ttf')
//   }
// };

// const printer = new PdfPrinter(fonts);

// function generatePdf(docDefinition, res) {
//   const pdfDoc = printer.createPdfKitDocument(docDefinition);

//   if (res) {
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Disposition', 'inline; filename=document.pdf');
//     pdfDoc.pipe(res);
//     pdfDoc.end();
//   }

//   return pdfDoc;
// }

// module.exports = { generatePdf };
