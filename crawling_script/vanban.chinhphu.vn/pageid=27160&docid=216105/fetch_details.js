/**
 * Fetch detailed document information from vanban.chinhphu.vn
 * Reads from raw_result.json and creates detailed_result.json
 * 
 * Usage:
 *   node fetch_details.js                    // Fetch details only
 *   node fetch_details.js --download         // Fetch details and download attachments
 *   node fetch_details.js --limit 10         // Process only first 10 documents
 *   node fetch_details.js --download --limit 10
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const RAW_RESULT_PATH = path.join(__dirname, '../../../result/vanban.chinhphu.vn/raw_result.json');
const DETAILED_RESULT_PATH = path.join(__dirname, '../../../result/vanban.chinhphu.vn/detailed_result.json');
const DOWNLOAD_BASE_DIR = path.join(__dirname, '../../../result/vanban.chinhphu.vn/attachments');
const DELAY_MS = 100; // Delay between requests to avoid overwhelming the server

// Parse command line arguments
const args = process.argv.slice(2);
const shouldDownload = args.includes('--download');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;

/**
 * Fetch HTML content from URL
 */
async function fetchHTML(url) {
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
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Download file from URL to destination
 */
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        fs.unlink(destPath, () => {}); // Delete the file if download failed
        reject(new Error(`HTTP ${response.statusCode}: ${url}`));
      }
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete the file on error
      reject(err);
    });
    
    file.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

/**
 * Parse detailed information from HTML
 * Based on analysis of details.html structure:
 * - Title in: span#ctrl_190596_91_lb_noidung or h4.title
 * - Details in: table with td.col1 (labels) and adjacent td (values)
 * - Attachments in: div.rp-file with links
 * 
 * Fields extracted (without DETAIL_ prefix):
 * - Số ký hiệu (CODE)
 * - Ngày ban hành (ISSUE_DATE)
 * - Ngày có hiệu lực (EFFECTIVE_DATE)
 * - Loại văn bản (DOCUMENT_TYPE)
 * - Cơ quan ban hành (ISSUING_AGENCY)
 * - Người ký (SIGNER)
 * - Trích yếu (SUMMARY)
 * - Tài liệu đính kèm (ATTACHMENTS)
 */
function parseDetailHTML(html, pageId, docId) {
  const detail = {
    PAGE_ID: pageId,
    DOC_ID: docId,
    DETAIL_URL: `https://vanban.chinhphu.vn/?pageid=${pageId}&docid=${docId}`
  };

  // Extract title/summary from h4.title or span#ctrl_190596_91_lb_noidung
  const titleMatch = html.match(/<span[^>]*id="ctrl_\d+_\d+_lb_noidung"[^>]*>(.*?)<\/span>/s) ||
                     html.match(/<h4[^>]*class="[^"]*title[^"]*"[^>]*>.*?<span[^>]*>(.*?)<\/span>/s);
  if (titleMatch) {
    detail.TITLE = titleMatch[1].replace(/<[^>]*>/g, '').trim();
  }

  // Extract from table structure: <td class="col1">Label</td><td>Value</td>
  
  // Extract document code (Số ký hiệu)
  const codeMatch = html.match(/<td[^>]*class="[^"]*col1[^"]*"[^>]*>Số ký hiệu<\/td>\s*<td[^>]*>(.*?)<\/td>/s);
  if (codeMatch) {
    detail.CODE = codeMatch[1].replace(/<[^>]*>/g, '').trim();
  }

  // Extract issue date (Ngày ban hành)
  const issueDateMatch = html.match(/<td[^>]*class="[^"]*col1[^"]*"[^>]*>Ngày ban hành<\/td>\s*<td[^>]*>(.*?)<\/td>/s);
  if (issueDateMatch) {
    detail.ISSUE_DATE = issueDateMatch[1].replace(/<[^>]*>/g, '').trim();
  }

  // Extract effective date (Ngày có hiệu lực)
  const effectiveDateMatch = html.match(/<td[^>]*class="[^"]*col1[^"]*"[^>]*>Ngày có hiệu lực<\/td>\s*<td[^>]*>(.*?)<\/td>/s);
  if (effectiveDateMatch) {
    detail.EFFECTIVE_DATE = effectiveDateMatch[1].replace(/<[^>]*>/g, '').trim();
  }

  // Extract document type (Loại văn bản)
  const typeMatch = html.match(/<td[^>]*class="[^"]*col1[^"]*"[^>]*>Loại văn bản<\/td>\s*<td[^>]*>(.*?)<\/td>/s);
  if (typeMatch) {
    detail.DOCUMENT_TYPE = typeMatch[1].replace(/<[^>]*>/g, '').trim();
  }

  // Extract issuing agency (Cơ quan ban hành)
  const agencyMatch = html.match(/<td[^>]*class="[^"]*col1[^"]*"[^>]*>Cơ quan ban hành<\/td>\s*<td[^>]*>(.*?)<\/td>/s);
  if (agencyMatch) {
    detail.ISSUING_AGENCY = agencyMatch[1].replace(/<[^>]*>/g, '').trim();
  }

  // Extract signer (Người ký)
  const signerMatch = html.match(/<td[^>]*class="[^"]*col1[^"]*"[^>]*>Người ký<\/td>\s*<td[^>]*>(.*?)<\/td>/s);
  if (signerMatch) {
    detail.SIGNER = signerMatch[1].replace(/<[^>]*>/g, '').trim();
  }

  // Extract summary (Trích yếu)
  const summaryMatch = html.match(/<td[^>]*class="[^"]*col1[^"]*"[^>]*>Trích yếu<\/td>\s*<td[^>]*>(.*?)<\/td>/s);
  if (summaryMatch) {
    detail.SUMMARY = summaryMatch[1].replace(/<[^>]*>/g, '').trim();
  }

  // Extract attachments from rp-file divs
  const attachments = [];
  const attachmentRegex = /<div[^>]*class="[^"]*rp-file[^"]*"[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*(?:title="[^"]*")?[^>]*(?:download)?[^>]*(?:target='_blank')?[^>]*class="view-file"[^>]*>(.*?)<i/gs;
  let attachMatch;
  while ((attachMatch = attachmentRegex.exec(html)) !== null) {
    const url = attachMatch[1].trim();
    const label = attachMatch[2].replace(/<[^>]*>/g, '').trim();
    const filename = url.split('/').pop() || label;
    
    attachments.push({
      url: url.startsWith('http') ? url : `https://datafiles.chinhphu.vn${url}`,
      label,
      filename
    });
  }
  detail.ATTACHMENTS = attachments;

  return detail;
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
  console.log('Reading raw_result.json...');
  
  // Read raw results
  let rawResults;
  try {
    const rawData = fs.readFileSync(RAW_RESULT_PATH, 'utf8');
    rawResults = JSON.parse(rawData);
  } catch (err) {
    console.error(`Error reading ${RAW_RESULT_PATH}:`, err.message);
    process.exit(1);
  }

  console.log(`Found ${rawResults.length} documents in raw_result.json`);
  
  // Apply limit if specified
  const documentsToProcess = limit ? rawResults.slice(0, limit) : rawResults;
  console.log(`Processing ${documentsToProcess.length} documents...`);
  if (shouldDownload) {
    console.log('Download mode: ON - attachments will be downloaded');
  } else {
    console.log('Download mode: OFF - use --download to enable attachment downloads');
  }

  const detailedResults = [];
  let successCount = 0;
  let failCount = 0;

  // Phase 1: Fetch all details (without downloading)
  console.log('\n=== Phase 1: Fetching Document Details ===\n');
  
  for (let i = 0; i < documentsToProcess.length; i++) {
    const doc = documentsToProcess[i];
    const { PAGE_ID, DOC_ID } = doc;
    const url = `https://vanban.chinhphu.vn/?pageid=${PAGE_ID}&docid=${DOC_ID}`;
    
    console.log(`\n[${i + 1}/${documentsToProcess.length}] Fetching: ${url}`);
    
    try {
      // Fetch HTML
      const html = await fetchHTML(url);
      
      // Parse details - now returns complete object with PAGE_ID, DOC_ID, DETAIL_URL
      const detailData = parseDetailHTML(html, PAGE_ID, DOC_ID);
      
      detailedResults.push(detailData);
      
      console.log(`  ✓ Code: ${detailData.CODE || 'N/A'}`);
      console.log(`  ✓ Attachments: ${detailData.ATTACHMENTS?.length || 0}`);
      
      successCount++;
      
      // Delay between requests
      if (i < documentsToProcess.length - 1) {
        await sleep(DELAY_MS);
      }
      
    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}`);
      failCount++;
      
      // Add placeholder for failed document (keep basic info)
      detailedResults.push({
        PAGE_ID,
        DOC_ID,
        DETAIL_URL: url,
        ERROR: err.message
      });
    }
  }

  // Save detailed results
  console.log(`\n\n=== Saving Results ===`);
  console.log(`Saving detailed results to ${DETAILED_RESULT_PATH}...`);
  try {
    const resultDir = path.dirname(DETAILED_RESULT_PATH);
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }
    fs.writeFileSync(DETAILED_RESULT_PATH, JSON.stringify(detailedResults, null, 2), 'utf8');
    console.log('✓ Detailed results saved successfully!');
  } catch (err) {
    console.error('✗ Error saving detailed results:', err.message);
    process.exit(1);
  }

  // Phase 2: Download attachments (only if enabled and after JSON is saved)
  if (shouldDownload) {
    console.log('\n\n=== Phase 2: Downloading Attachments ===\n');
    
    let totalAttachments = 0;
    let downloadedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < detailedResults.length; i++) {
      const doc = detailedResults[i];
      const { PAGE_ID, DOC_ID, ATTACHMENTS } = doc;
      
      if (!ATTACHMENTS || ATTACHMENTS.length === 0) {
        continue;
      }

      totalAttachments += ATTACHMENTS.length;
      
      console.log(`\n[${i + 1}/${detailedResults.length}] Document: pageid=${PAGE_ID}&docid=${DOC_ID}`);
      console.log(`  Attachments: ${ATTACHMENTS.length}`);
      
      const docDir = path.join(DOWNLOAD_BASE_DIR, `pageid=${PAGE_ID}&docid=${DOC_ID}`);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(docDir)) {
        fs.mkdirSync(docDir, { recursive: true });
      }
      
      // Download each attachment
      for (const attachment of ATTACHMENTS) {
        const destPath = path.join(docDir, attachment.filename);
        
        try {
          console.log(`    Downloading: ${attachment.filename}...`);
          await downloadFile(attachment.url, destPath);
          console.log(`    ✓ Saved: ${destPath}`);
          downloadedCount++;
        } catch (err) {
          console.log(`    ✗ Failed: ${err.message}`);
          failedCount++;
        }
        
        // Small delay between downloads
        await sleep(100);
      }
    }

    console.log(`\n=== Download Summary ===`);
    console.log(`Total attachments: ${totalAttachments}`);
    console.log(`Downloaded: ${downloadedCount}`);
    console.log(`Failed: ${failedCount}`);
    console.log(`Download directory: ${DOWNLOAD_BASE_DIR}`);
  }

  // Summary
  console.log('\n========== FINAL SUMMARY ==========');
  console.log(`Total processed: ${documentsToProcess.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Output: ${DETAILED_RESULT_PATH}`);
  if (shouldDownload) {
    console.log(`Attachments: ${DOWNLOAD_BASE_DIR}`);
  }
  console.log('===================================\n');
}

// Run main function
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
