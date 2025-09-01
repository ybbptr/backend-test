// const puppeteer = require('puppeteer');
// const handlebars = require('handlebars');
// const fs = require('fs');
// const path = require('path');

// async function generateLoanPdf(loan) {
//   const templatePath = path.join(__dirname, '../templates/loan.hbs');
//   const html = fs.readFileSync(templatePath, 'utf8');

//   const template = handlebars.compile(html);

//   const content = template(loan);

//   const browser = await puppeteer.launch({
//     headless: 'new',
//     args: ['--no-sandbox', '--disable-setuid-sandbox']
//   });

//   const page = await browser.newPage();
//   await page.setContent(content, { waitUntil: 'networkidle0' });

//   const pdfBuffer = await page.pdf({
//     format: 'A4',
//     printBackground: true
//   });

//   await browser.close();
//   return pdfBuffer;
// }

// module.exports = generateLoanPdf;
