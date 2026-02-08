const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, 'api.ts');
let content = fs.readFileSync(apiPath, 'utf8');

// 1) Remove file field restriction; add unsupported file type check
const old1 = `    const allowedFileFields = ['file', 'excel', 'upload'];
    busboy.on('file', async (fieldName: string, file: NodeJS.ReadableStream, info: any) => {
      const name = (fieldName || '').toLowerCase();
      if (!allowedFileFields.includes(name)) {
        file.resume();
        return;
      }
      if (fileFound) {
        file.resume();
        return;
      }
      fileFound = true;
      const filename = info.filename || '';
      const lower = filename.toLowerCase();

      const setHeaderRowAndMap`;

const new1 = `    busboy.on('file', async (_fieldName: string, file: NodeJS.ReadableStream, info: any) => {
      if (fileFound) {
        file.resume();
        return;
      }
      fileFound = true;
      const filename = info.filename || '';
      const lower = filename.toLowerCase();
      const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
      const isCsv = ext === '.csv';
      const isExcel = ext === '.xlsx' || ext === '.xlsm';
      if (!isCsv && !isExcel) {
        analyzeError = 'Unsupported file type. Use .xlsx, .xlsm, or .csv';
        file.resume();
        await finish();
        return;
      }

      const setHeaderRowAndMap`;

if (content.includes(old1)) {
  content = content.replace(old1, new1);
  console.log('Applied patch 1: file field + unsupported type');
} else {
  console.log('Patch 1 not found (maybe already applied?)');
}

// 2) CSV: header = first row with >= 2 non-empty cells
const old2 = `          const rowHasNonEmpty = (row: Record<string, string>) =>
            Object.values(row).some((v) => String(v ?? '').trim() !== '');
          let headerRowIndex = -1;
          for (let i = 0; i < rows.length; i++) {
            if (rowHasNonEmpty(rows[i])) {
              headerRowIndex = i;
              break;
            }
          }`;

const new2 = `          const nonEmptyCount = (row: Record<string, string>) =>
            Object.values(row).filter((v) => String(v ?? '').trim() !== '').length;
          const rowHasNonEmpty = (row: Record<string, string>) => nonEmptyCount(row) > 0;
          let headerRowIndex = -1;
          for (let i = 0; i < rows.length; i++) {
            if (nonEmptyCount(rows[i]) >= 2) {
              headerRowIndex = i;
              break;
            }
          }`;

if (content.includes(old2)) {
  content = content.replace(old2, new2);
  console.log('Applied patch 2: CSV header >= 2 cells');
} else {
  console.log('Patch 2 not found');
}

// 3) Excel: header = first row with >= 2 non-empty cells
const old3 = `        const rowHasNonEmptyArr = (arr: string[]) => arr.some((c) => c !== '');
        let headerRowIndex = -1;
        for (let i = 0; i < excelRows.length; i++) {
          if (rowHasNonEmptyArr(excelRows[i])) {
            headerRowIndex = i;
            break;
          }
        }`;

const new3 = `        const nonEmptyCountArr = (arr: string[]) => arr.filter((c) => String(c).trim() !== '').length;
        const rowHasNonEmptyArr = (arr: string[]) => nonEmptyCountArr(arr) > 0;
        let headerRowIndex = -1;
        for (let i = 0; i < excelRows.length; i++) {
          if (nonEmptyCountArr(excelRows[i]) >= 2) {
            headerRowIndex = i;
            break;
          }
        }`;

if (content.includes(old3)) {
  content = content.replace(old3, new3);
  console.log('Applied patch 3: Excel header >= 2 cells');
} else {
  console.log('Patch 3 not found');
}

const outPath = path.join(__dirname, 'api-patched.ts');
fs.writeFileSync(outPath, content);
console.log('Done. Patched content written to backend/api-patched.ts');
console.log('Copy api-patched.ts over api.ts (e.g. after closing api.ts in the editor).');
