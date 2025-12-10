/**
 * Fetch TTHC details and download documents from dichvucong.gov.vn
 * 
 * Workflow:
 * 1. Read raw_result.json (list of TTHC with TTHC_MA)
 * 2. For each TTHC_MA, fetch first detail page to get idTTHC:
 *    https://dichvucong.gov.vn/p/home/dvc-chi-tiet-thu-tuc-hanh-chinh.html?ma_thu_tuc={TTHC_MA}
 * 3. Extract idTTHC from "Xem chi tiết" link
 * 4. Construct export URL: /jsp/tthc/export/export_word_detail_tthc.jsp?maTTHC={TTHC_MA}&idTTHC={idTTHC}
 * 5. Download the detailed procedure Word document
 * 
 * Usage:
 *   node fetch_tthc_details.js                          // Fetch details for công dân file
 *   node fetch_tthc_details.js --doanhnghiep            // Fetch details for doanh nghiệp file
 *   node fetch_tthc_details.js --limit 10               // Process only first 10 records
 *   node fetch_tthc_details.js --download               // Download Word documents after fetching details
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Parse command line arguments
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;
const isDoanhNghiep = args.includes('--doanhnghiep');
const shouldDownload = args.includes('--download');

// Configuration
const RESULT_FILENAME = isDoanhNghiep ? 'doanhnghiep_raw_result.json' : 'congdan_raw_result.json';
const RAW_RESULT_PATH = path.join(__dirname, '../../../../../result/dichvucong.gov.vn/p/home/dvc-dich-vu-cong-truc-tuyen-ds', RESULT_FILENAME);
const DETAILED_RESULT_FILENAME = isDoanhNghiep ? 'doanhnghiep_detailed_result.json' : 'congdan_detailed_result.json';
const DETAILED_RESULT_PATH = path.join(__dirname, '../../../../../result/dichvucong.gov.vn/p/home/dvc-dich-vu-cong-truc-tuyen-ds', DETAILED_RESULT_FILENAME);
const DOWNLOAD_BASE_DIR = path.join(__dirname, '../../../../../result/dichvucong.gov.vn/p/home/dvc-dich-vu-cong-truc-tuyen-ds/attachments', isDoanhNghiep ? 'doanhnghiep' : 'congdan');
const DELAY_MS = 500; // Delay between requests
const DOWNLOAD_URL_BASE = 'https://dichvucong.gov.vn'; // Will be fetched from API

/**
 * Make HTTPS GET request
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Download file from URL
 */
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        file.close();
        fs.unlink(filePath, () => {}); // Delete the file
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      fs.unlink(filePath, () => {}); // Delete the file
      reject(err);
    });
  });
}

/**
 * Parse first detail page HTML to extract idTTHC
 */
function parseDetailHTML(html, tthcMa) {
  // Extract idTTHC from "Xem chi tiết" link
  // Pattern: href="dvc-tthc-thu-tuc-hanh-chinh-chi-tiet.html?ma_thu_tuc=7603"
  const idPattern = /href="dvc-tthc-thu-tuc-hanh-chinh-chi-tiet\.html\?ma_thu_tuc=(\d+)"/;
  const idMatch = html.match(idPattern);
  const idTTHC = idMatch ? idMatch[1] : null;
  
  // Construct export URL if we have idTTHC
  const exportUrl = idTTHC 
    ? `/jsp/tthc/export/export_word_detail_tthc.jsp?maTTHC=${tthcMa}&idTTHC=${idTTHC}`
    : null;
  
  return {
    TTHC_MA: tthcMa,
    ID_TTHC: idTTHC,
    DETAIL_URL: `https://dichvucong.gov.vn/p/home/dvc-chi-tiet-thu-tuc-hanh-chinh.html?ma_thu_tuc=${tthcMa}`,
    DETAIL_URL_FULL: idTTHC ? `https://dichvucong.gov.vn/p/home/dvc-tthc-thu-tuc-hanh-chinh-chi-tiet.html?ma_thu_tuc=${idTTHC}` : null,
    EXPORT_WORD_URL: exportUrl ? `https://dichvucong.gov.vn${exportUrl}` : null,
    HAS_EXPORT: exportUrl !== null
  };
}

/**
 * Fetch detail page for a TTHC to get idTTHC
 */
async function fetchTTHCDetail(tthcMa) {
  const url = `https://dichvucong.gov.vn/p/home/dvc-chi-tiet-thu-tuc-hanh-chinh.html?ma_thu_tuc=${tthcMa}`;
  
  try {
    const html = await httpsGet(url);
    return parseDetailHTML(html, tthcMa);
  } catch (err) {
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }
}

/**
 * Download Word export file for a TTHC
 */
async function downloadWordExport(tthcDetail) {
  if (!tthcDetail.EXPORT_WORD_URL) {
    return { success: false, error: 'No export URL' };
  }
  
  const tthcDir = path.join(DOWNLOAD_BASE_DIR, tthcDetail.TTHC_MA.replace(/[\\:*?"<>|]/g, '_'));
  
  // Create directory
  if (!fs.existsSync(tthcDir)) {
    fs.mkdirSync(tthcDir, { recursive: true });
  }
  
  const filename = `${tthcDetail.TTHC_MA.replace(/[\\:*?"<>|]/g, '_')}_chi_tiet.doc`;
  const filePath = path.join(tthcDir, filename);
  
  try {
    await downloadFile(tthcDetail.EXPORT_WORD_URL, filePath);
    return { success: true, filename };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main function
 */
async function main() {
  const objectTypeLabel = isDoanhNghiep ? 'Doanh nghiệp' : 'Công dân';
  console.log('=== Fetching TTHC Details from dichvucong.gov.vn ===');
  console.log(`Object Type: ${objectTypeLabel}`);
  console.log(`Input File: ${RESULT_FILENAME}`);
  console.log(`Output File: ${DETAILED_RESULT_FILENAME}\n`);
  
  // Read raw result
  if (!fs.existsSync(RAW_RESULT_PATH)) {
    console.error(`Error: File not found: ${RAW_RESULT_PATH}`);
    console.log('Please run list_tthc.js first to fetch the TTHC list.');
    process.exit(1);
  }
  
  const rawData = JSON.parse(fs.readFileSync(RAW_RESULT_PATH, 'utf8'));
  console.log(`Loaded ${rawData.length} TTHC records\n`);
  
  // Apply limit
  const recordsToProcess = limit ? rawData.slice(0, limit) : rawData;
  console.log(`Processing ${recordsToProcess.length} records...\n`);
  
  // Phase 1: Fetch details (no downloads)
  console.log('=== Phase 1: Fetching Details ===\n');
  
  const detailedResults = [];
  let fetchStats = { success: 0, failed: 0 };
  
  for (let i = 0; i < recordsToProcess.length; i++) {
    const tthc = recordsToProcess[i];
    const progress = `[${i + 1}/${recordsToProcess.length}]`;
    
    console.log(`${progress} Fetching ${tthc.TTHC_MA} - ${tthc.NAME}`);
    
    try {
      const detail = await fetchTTHCDetail(tthc.TTHC_MA);
      
      // Merge with raw data
      const merged = {
        ...tthc,
        ...detail
      };
      
      detailedResults.push(merged);
      fetchStats.success++;
      
      console.log(`  ✓ Export URL: ${detail.HAS_EXPORT ? 'Found' : 'Not found'}`);
      
      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
      fetchStats.failed++;
      
      // Still add to results but without detail data
      detailedResults.push({
        ...tthc,
        DETAIL_URL: `https://dichvucong.gov.vn/p/home/dvc-chi-tiet-thu-tuc-hanh-chinh.html?ma_thu_tuc=${tthc.TTHC_MA}`,
        DETAIL_URL_FULL: null,
        ID_TTHC: null,
        EXPORT_WORD_URL: null,
        HAS_EXPORT: false,
        ERROR: err.message
      });
    }
  }
  
  // Save detailed results
  console.log(`\n=== Saving Results ===`);
  const resultDir = path.dirname(DETAILED_RESULT_PATH);
  if (!fs.existsSync(resultDir)) {
    fs.mkdirSync(resultDir, { recursive: true });
  }
  
  fs.writeFileSync(DETAILED_RESULT_PATH, JSON.stringify(detailedResults, null, 2), 'utf8');
  console.log(`✓ Saved ${detailedResults.length} records to ${DETAILED_RESULT_FILENAME}`);
  
  console.log(`\n=== Phase 1 Summary ===`);
  console.log(`Total: ${recordsToProcess.length}`);
  console.log(`Success: ${fetchStats.success}`);
  console.log(`Failed: ${fetchStats.failed}`);
  
  const totalWithExport = detailedResults.filter(r => r.HAS_EXPORT).length;
  console.log(`TTHC with export URL: ${totalWithExport}`);
  
  // Phase 2: Download Word export files (if --download flag is set)
  if (shouldDownload && totalWithExport > 0) {
    console.log(`\n=== Phase 2: Downloading Word Export Files ===\n`);
    
    // Download Word exports
    let downloadStats = { total: 0, success: 0, failed: 0 };
    
    for (let i = 0; i < detailedResults.length; i++) {
      const tthc = detailedResults[i];
      
      if (!tthc.HAS_EXPORT) {
        continue;
      }
      
      downloadStats.total++;
      const progress = `[${downloadStats.total}/${totalWithExport}]`;
      console.log(`${progress} Downloading ${tthc.TTHC_MA} - ${tthc.NAME}`);
      
      const result = await downloadWordExport(tthc);
      
      if (result.success) {
        downloadStats.success++;
        console.log(`  ✓ Downloaded ${result.filename}`);
      } else {
        downloadStats.failed++;
        console.log(`  ✗ Failed: ${result.error}`);
      }
      
      await sleep(DELAY_MS);
    }
    
    console.log(`\n=== Phase 2 Summary ===`);
    console.log(`Total files: ${downloadStats.total}`);
    console.log(`Success: ${downloadStats.success}`);
    console.log(`Failed: ${downloadStats.failed}`);
    console.log(`Download directory: ${DOWNLOAD_BASE_DIR}`);
  } else if (!shouldDownload && totalWithExport > 0) {
    console.log(`\n💡 To download Word export files, run with --download flag`);
  } else {
    console.log(`\n⚠️ No TTHC with export URL found`);
  }
}

// Run main function
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
