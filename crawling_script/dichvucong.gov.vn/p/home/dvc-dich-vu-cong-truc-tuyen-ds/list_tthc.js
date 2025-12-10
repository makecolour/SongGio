/**
 * Crawl all TTHC (Thủ tục hành chính) from dichvucong.gov.vn
 * 
 * Usage:
 *   node list_tthc.js                    // Crawl procedures for công dân (pObjectType=1)
 *   node list_tthc.js --doanhnghiep      // Crawl procedures for doanh nghiệp (pObjectType=5)
 *   node list_tthc.js --limit 100        // Crawl only first 100 procedures
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Parse command line arguments
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;
const isDoanhNghiep = args.includes('--doanhnghiep');

// Configuration
const OBJECT_TYPE = isDoanhNghiep ? 5 : 1; // 1 = công dân, 5 = doanh nghiệp
const RESULT_FILENAME = isDoanhNghiep ? 'doanhnghiep_raw_result.json' : 'congdan_raw_result.json';
const RESULT_PATH = path.join(__dirname, '../../../../../result/dichvucong.gov.vn/p/home/dvc-dich-vu-cong-truc-tuyen-ds', RESULT_FILENAME);
const PAGE_SIZE = 1000; // Records per page (use 10 for testing, 1000 for production)
const DELAY_MS = 100; // Delay between requests

/**
 * Make POST request to fetch TTHC data
 */
async function fetchTTHC(pageIndex) {
  const params = {
    service: 'get_ds_tthc_da_cong_bo_dvc_service',
    type: 'ref',
    provider: 'dvcquocgiaRead',
    pKeyWord: '',
    pCoQuanId: -1,
    pObjectType: OBJECT_TYPE,
    pMucDo: -1,
    p_Page_Size: PAGE_SIZE,
    p_Page_Index: pageIndex
  };

  const formData = `params=${encodeURIComponent(JSON.stringify(params))}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'dichvucong.gov.vn',
      path: '/jsp/rest.jsp',
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'vi,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(formData),
        'Referer': 'https://dichvucong.gov.vn/p/home/dvc-dich-vu-cong-truc-tuyen-ds.html?pkeyWord=',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            // Debug: log response
            console.log(`  Response length: ${data.length} bytes`);
            console.log(`  First 200 chars: ${data.substring(0, 200)}`);
            
            const json = JSON.parse(data);
            resolve(json);
          } catch (err) {
            console.log(`  Parse error. Raw data: ${data.substring(0, 500)}`);
            reject(new Error(`JSON parse error: ${err.message}`));
          }
        } else {
          console.log(`  HTTP error ${res.statusCode}. Body: ${data.substring(0, 500)}`);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(formData);
    req.end();
  });
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main crawling function
 */
async function main() {
  const objectTypeLabel = isDoanhNghiep ? 'Doanh nghiệp (pObjectType=5)' : 'Công dân (pObjectType=1)';
  console.log('=== Crawling TTHC from dichvucong.gov.vn ===');
  console.log(`Object Type: ${objectTypeLabel}`);
  console.log(`Output File: ${RESULT_FILENAME}\n`);
  
  const allTTHC = [];
  let pageIndex = 1;
  let totalRecords = 0;

  try {
    // Fetch first page to get total count
    console.log(`Fetching page ${pageIndex}...`);
    const firstPage = await fetchTTHC(pageIndex);
    
    if (!Array.isArray(firstPage) || firstPage.length === 0) {
      console.log('No data returned from API');
      return;
    }

    // Get total records from first item
    totalRecords = parseInt(firstPage[0].TOTAL_RECORDS || 0);
    console.log(`Total records available: ${totalRecords}`);
    
    // Add first page data
    allTTHC.push(...firstPage);
    console.log(`✓ Page ${pageIndex}: ${firstPage.length} records`);

    // Calculate total pages
    const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    console.log(`Total pages: ${totalPages}\n`);

    // Apply limit if specified
    const maxRecords = limit || totalRecords;
    const maxPages = Math.ceil(maxRecords / PAGE_SIZE);
    console.log(`Will crawl ${maxPages} page(s) (${Math.min(maxRecords, totalRecords)} records)\n`);

    // Fetch remaining pages
    for (pageIndex = 2; pageIndex <= maxPages; pageIndex++) {
      await sleep(DELAY_MS);
      
      console.log(`Fetching page ${pageIndex}/${maxPages}...`);
      
      try {
        const pageData = await fetchTTHC(pageIndex);
        
        if (!Array.isArray(pageData) || pageData.length === 0) {
          console.log(`  ✗ No data on page ${pageIndex}`);
          break;
        }

        allTTHC.push(...pageData);
        console.log(`  ✓ Page ${pageIndex}: ${pageData.length} records (Total: ${allTTHC.length})`);

        // Check if we've reached the limit
        if (limit && allTTHC.length >= limit) {
          console.log(`\nReached limit of ${limit} records`);
          break;
        }

      } catch (err) {
        console.log(`  ✗ Error on page ${pageIndex}: ${err.message}`);
        // Continue to next page instead of stopping
      }
    }

    // Remove duplicates based on TTHC_MA
    const uniqueTTHC = Array.from(
      new Map(allTTHC.map(item => [item.TTHC_MA, item])).values()
    );

    console.log(`\n=== Summary ===`);
    console.log(`Total records fetched: ${allTTHC.length}`);
    console.log(`Unique records: ${uniqueTTHC.length}`);
    console.log(`Duplicates removed: ${allTTHC.length - uniqueTTHC.length}`);

    // Apply limit to final result if specified
    const finalResult = limit ? uniqueTTHC.slice(0, limit) : uniqueTTHC;

    // Save to file
    console.log(`\nSaving to ${RESULT_PATH}...`);
    const resultDir = path.dirname(RESULT_PATH);
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }

    fs.writeFileSync(RESULT_PATH, JSON.stringify(finalResult, null, 2), 'utf8');
    console.log(`✓ Saved ${finalResult.length} records to raw_result.json`);

    // Print sample data
    console.log('\n=== Sample Record ===');
    console.log(JSON.stringify(finalResult[0], null, 2));

  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

// Run main function
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
