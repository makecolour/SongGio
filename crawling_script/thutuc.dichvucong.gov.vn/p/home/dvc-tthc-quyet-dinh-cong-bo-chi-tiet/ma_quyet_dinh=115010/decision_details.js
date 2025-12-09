const fs = require('fs');
const path = require('path');

/**
 * Crawl detailed information for each decision
 */
class DecisionDetailCrawler {
  constructor() {
    this.baseUrl = 'https://thutuc.dichvucong.gov.vn/jsp/rest.jsp';
    this.recordsPerPage = 50;
    this.agencyMap = new Map();
    this.fieldMap = new Map();
    this.detailedDecisions = [];
  }

  /**
   * Load and cache agency data
   */
  async loadAgencies() {
    console.log('Loading agency data...');
    const agencyPath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'example', 'thutuc.dichvucong.gov.vn', 'p', 'home', 'dvc-tthc-quyet-dinh-cong-bo', 'get_list_agency_service_v2.json');
    
    if (fs.existsSync(agencyPath)) {
      const agencies = JSON.parse(fs.readFileSync(agencyPath, 'utf-8'));
      agencies.forEach(agency => {
        this.agencyMap.set(agency.ID, agency);
      });
      console.log(`Loaded ${this.agencyMap.size} agencies from cache`);
    } else {
      console.log('Fetching agency data from API...');
      const agencies = await this.fetchAgencies();
      agencies.forEach(agency => {
        this.agencyMap.set(agency.ID, agency);
      });
    }
  }

  /**
   * Load and cache field data
   */
  async loadFields() {
    console.log('Loading field data...');
    const fieldPath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'example', 'thutuc.dichvucong.gov.vn', 'p', 'home', 'dvc-tthc-quyet-dinh-cong-bo', 'procedure_get_list_field_service_v2.json');
    
    if (fs.existsSync(fieldPath)) {
      const fields = JSON.parse(fs.readFileSync(fieldPath, 'utf-8'));
      fields.forEach(field => {
        this.fieldMap.set(field.ID, field);
      });
      console.log(`Loaded ${this.fieldMap.size} fields from cache`);
    } else {
      console.log('Fetching field data from API...');
      const fields = await this.fetchFields();
      fields.forEach(field => {
        this.fieldMap.set(field.ID, field);
      });
    }
  }

  /**
   * Fetch agencies from API
   */
  async fetchAgencies() {
    const params = {
      service: 'get_list_agency_service_v2',
      provider: 'dvcquocgia',
      type: 'ref'
    };

    const formData = `params=${encodeURIComponent(JSON.stringify(params))}`;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: formData
    });

    return await response.json();
  }

  /**
   * Fetch fields from API
   */
  async fetchFields() {
    const params = {
      service: 'procedure_get_list_field_service_v2',
      provider: 'dvcquocgia',
      type: 'ref'
    };

    const formData = `params=${encodeURIComponent(JSON.stringify(params))}`;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: formData
    });

    return await response.json();
  }

  /**
   * Fetch fields for a specific decision
   */
  async fetchDecisionFields(decisionId) {
    const params = {
      service: 'get_fields_by_dp_id_services_v2',
      provider: 'dvcquocgia',
      type: 'ref',
      id: parseInt(decisionId)
    };

    const formData = `params=${encodeURIComponent(JSON.stringify(params))}`;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: formData
      });

      return await response.json();
    } catch (error) {
      console.error(`Error fetching fields for decision ${decisionId}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch HTML page and extract additional details
   */
  async fetchDecisionHTMLDetails(decisionId) {
    const url = `https://thutuc.dichvucong.gov.vn/p/home/dvc-tthc-quyet-dinh-cong-bo-chi-tiet.html?ma_quyet_dinh=${decisionId}`;
    
    try {
      const response = await fetch(url);
      const html = await response.text();
      
      // Extract attachment information from the HTML
      const attachments = this.extractAttachments(html);
      
      return {
        attachments,
        html_url: url
      };
    } catch (error) {
      console.error(`Error fetching HTML details for decision ${decisionId}:`, error.message);
      return {
        attachments: [],
        html_url: url,
        error: error.message
      };
    }
  }

  /**
   * Extract attachments from HTML content
   */
  extractAttachments(html) {
    const attachments = [];
    
    // Look for the JavaScript variable that contains attachment data
    // Pattern: var str = '[{"tenTep":"...","code":"...","tepDinhKemId":"..."}]'
    const attachmentVarRegex = /var\s+str\s*=\s*'(\[.*?\])'/g;
    const match = attachmentVarRegex.exec(html);
    
    if (match && match[1]) {
      try {
        // Parse the JSON string
        const attachmentData = JSON.parse(match[1]);
        
        attachmentData.forEach(item => {
          attachments.push({
            filename: item.tenTep,
            code: item.code,
            file_id: item.tepDinhKemId,
            download_url: `https://csdl.dichvucong.gov.vn/web/jsp/download_file.jsp?ma=${item.code}`
          });
        });
      } catch (error) {
        console.error('Error parsing attachment JSON:', error.message);
      }
    }
    
    return attachments;
  }

  /**
   * Fetch new procedures for a decision with pagination
   */
  async fetchNewProcedures(decisionId, pageIndex = 1) {
    const params = {
      service: 'get_procedures_by_dp_id_service_v2',
      provider: 'dvcquocgia',
      type: 'ref',
      id: parseInt(decisionId),
      recordPerPage: this.recordsPerPage,
      pageIndex: pageIndex
    };

    const formData = `params=${encodeURIComponent(JSON.stringify(params))}`;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: formData
      });

      return await response.json();
    } catch (error) {
      console.error(`Error fetching new procedures for decision ${decisionId}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch modified procedures for a decision with pagination
   */
  async fetchModifiedProcedures(decisionId, pageIndex = 1) {
    const params = {
      service: 'get_modified_procedures_by_dp_id_service_v2',
      provider: 'dvcquocgia',
      type: 'ref',
      id: parseInt(decisionId),
      recordPerPage: this.recordsPerPage,
      pageIndex: pageIndex
    };

    const formData = `params=${encodeURIComponent(JSON.stringify(params))}`;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: formData
      });

      return await response.json();
    } catch (error) {
      console.error(`Error fetching modified procedures for decision ${decisionId}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch rescinded procedures for a decision with pagination
   */
  async fetchRescindedProcedures(decisionId, pageIndex = 1) {
    const params = {
      service: 'get_rescinded_procedures_by_dp_id_service_v2',
      provider: 'dvcquocgia',
      type: 'ref',
      id: parseInt(decisionId),
      recordPerPage: this.recordsPerPage,
      pageIndex: pageIndex
    };

    const formData = `params=${encodeURIComponent(JSON.stringify(params))}`;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: formData
      });

      return await response.json();
    } catch (error) {
      console.error(`Error fetching rescinded procedures for decision ${decisionId}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch all pages of procedures
   */
  async fetchAllProcedures(decisionId, fetchFunction, procedureType) {
    const allProcedures = [];
    let pageIndex = 1;
    
    while (true) {
      const procedures = await fetchFunction.call(this, decisionId, pageIndex);
      
      if (!Array.isArray(procedures) || procedures.length === 0) {
        break;
      }

      allProcedures.push(...procedures);

      // Check if there are more pages
      const totalRecords = parseInt(procedures[0]?.AMOUNT || 0);
      const totalPages = Math.ceil(totalRecords / this.recordsPerPage);
      
      if (pageIndex >= totalPages) {
        break;
      }

      pageIndex++;
      await this.delay(500); // Delay between pages
    }

    return allProcedures;
  }

  /**
   * Fetch complete details for a single decision
   */
  async fetchDecisionDetails(decision) {
    const decisionId = decision.ID;
    console.log(`Fetching details for decision ${decisionId} (${decision.CODE})...`);

    try {
      // Fetch all data in parallel
      const [fields, newProcedures, modifiedProcedures, rescindedProcedures, htmlDetails] = await Promise.all([
        this.fetchDecisionFields(decisionId),
        this.fetchAllProcedures(decisionId, this.fetchNewProcedures, 'new'),
        this.fetchAllProcedures(decisionId, this.fetchModifiedProcedures, 'modified'),
        this.fetchAllProcedures(decisionId, this.fetchRescindedProcedures, 'rescinded'),
        this.fetchDecisionHTMLDetails(decisionId)
      ]);

      // Match agency data
      const agencyData = this.agencyMap.get(decision.AGENCY_ID) || null;

      // Match field data
      const matchedFields = fields.map(field => {
        const fieldData = this.fieldMap.get(field.ID);
        return {
          ...field,
          FIELD_FULL_NAME: fieldData?.FIELD_NAME || field.NAME
        };
      });

      // Build detailed decision object
      const detailedDecision = {
        ...decision,
        AGENCY_DETAILS: agencyData,
        DETAIL_URL: `https://thutuc.dichvucong.gov.vn/p/home/dvc-tthc-quyet-dinh-cong-bo-chi-tiet.html?ma_quyet_dinh=${decisionId}`,
        FIELDS: matchedFields,
        ATTACHMENTS: htmlDetails.attachments,
        PROCEDURES: {
          NEW: newProcedures,
          MODIFIED: modifiedProcedures,
          RESCINDED: rescindedProcedures
        },
        STATISTICS: {
          TOTAL_NEW_PROCEDURES: newProcedures.length,
          TOTAL_MODIFIED_PROCEDURES: modifiedProcedures.length,
          TOTAL_RESCINDED_PROCEDURES: rescindedProcedures.length,
          TOTAL_PROCEDURES: newProcedures.length + modifiedProcedures.length + rescindedProcedures.length,
          TOTAL_ATTACHMENTS: htmlDetails.attachments.length
        }
      };

      return detailedDecision;
    } catch (error) {
      console.error(`Error fetching details for decision ${decisionId}:`, error.message);
      return {
        ...decision,
        ERROR: error.message
      };
    }
  }

  /**
   * Crawl details for all decisions
   */
  async crawlAllDetails(decisions, options = {}) {
    const { limit = null, startIndex = 0, batchSize = 5 } = options;
    
    console.log('\n=== Starting Detail Crawl ===');
    console.log(`Total decisions to process: ${limit || decisions.length}`);
    console.log(`Batch size: ${batchSize}`);
    console.log(`Start index: ${startIndex}\n`);

    // Load reference data first
    await this.loadAgencies();
    await this.loadFields();

    // Determine which decisions to process
    const decisionsToProcess = limit 
      ? decisions.slice(startIndex, startIndex + limit)
      : decisions.slice(startIndex);

    // Process in batches
    for (let i = 0; i < decisionsToProcess.length; i += batchSize) {
      const batch = decisionsToProcess.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(decisionsToProcess.length / batchSize);
      
      console.log(`\n--- Processing Batch ${batchNumber}/${totalBatches} ---`);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(decision => this.fetchDecisionDetails(decision))
      );

      this.detailedDecisions.push(...batchResults);

      console.log(`Batch ${batchNumber} completed. Total processed: ${this.detailedDecisions.length}/${decisionsToProcess.length}`);

      // Save intermediate results
      if (batchNumber % 10 === 0 || i + batchSize >= decisionsToProcess.length) {
        this.saveIntermediateResults();
      }

      // Delay between batches
      if (i + batchSize < decisionsToProcess.length) {
        await this.delay(2000);
      }
    }

    console.log(`\nDetail crawling completed! Total: ${this.detailedDecisions.length}`);
    return this.detailedDecisions;
  }

  /**
   * Delay execution
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Save intermediate results
   */
  saveIntermediateResults() {
    const resultDir = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'result', 'thutuc.dichvucong.gov.vn', 'p', 'home', 'dvc-tthc-quyet-dinh-cong-bo');
    
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }

    const tempPath = path.join(resultDir, 'detailed_decisions_temp.json');
    fs.writeFileSync(tempPath, JSON.stringify(this.detailedDecisions, null, 2), 'utf-8');
    console.log(`Intermediate results saved (${this.detailedDecisions.length} decisions)`);
  }

  /**
   * Save final results
   */
  saveResults(outputPath) {
    const dir = path.dirname(outputPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(this.detailedDecisions, null, 2), 'utf-8');
    console.log(`\nFinal results saved to: ${outputPath}`);
    
    // Remove temp file if exists
    const tempPath = path.join(dir, 'detailed_decisions_temp.json');
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }

  /**
   * Print statistics
   */
  printStats() {
    console.log('\n=== Detailed Statistics ===');
    console.log(`Total decisions processed: ${this.detailedDecisions.length}`);
    
    if (this.detailedDecisions.length === 0) {
      return;
    }

    // Calculate totals
    let totalNew = 0;
    let totalModified = 0;
    let totalRescinded = 0;
    let totalAttachments = 0;
    const fieldCounts = {};
    const agencyCounts = {};

    this.detailedDecisions.forEach(decision => {
      if (decision.STATISTICS) {
        totalNew += decision.STATISTICS.TOTAL_NEW_PROCEDURES;
        totalModified += decision.STATISTICS.TOTAL_MODIFIED_PROCEDURES;
        totalRescinded += decision.STATISTICS.TOTAL_RESCINDED_PROCEDURES;
        totalAttachments += decision.STATISTICS.TOTAL_ATTACHMENTS || 0;
      }

      // Count by field
      if (decision.FIELDS) {
        decision.FIELDS.forEach(field => {
          const fieldName = field.NAME || field.FIELD_FULL_NAME;
          fieldCounts[fieldName] = (fieldCounts[fieldName] || 0) + 1;
        });
      }

      // Count by agency
      const agencyName = decision.AGENCY_NAME;
      agencyCounts[agencyName] = (agencyCounts[agencyName] || 0) + 1;
    });

    console.log(`\nProcedure Totals:`);
    console.log(`  New procedures: ${totalNew}`);
    console.log(`  Modified procedures: ${totalModified}`);
    console.log(`  Rescinded procedures: ${totalRescinded}`);
    console.log(`  Total procedures: ${totalNew + totalModified + totalRescinded}`);
    console.log(`  Total attachments: ${totalAttachments}`);

    console.log(`\nTop 10 Fields:`);
    const sortedFields = Object.entries(fieldCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    sortedFields.forEach(([field, count], index) => {
      console.log(`  ${index + 1}. ${field}: ${count} decisions`);
    });

    console.log(`\nTop 10 Agencies:`);
    const sortedAgencies = Object.entries(agencyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    sortedAgencies.forEach(([agency, count], index) => {
      console.log(`  ${index + 1}. ${agency}: ${count} decisions`);
    });
  }
}

// Main execution
async function main() {
  const crawler = new DecisionDetailCrawler();
  
  try {
    // Check for command line arguments
    const args = process.argv.slice(2);
    let decisions = [];
    let testMode = false;

    if (args.length > 0 && args[0] === '--test') {
      // Test mode: use provided decision IDs
      testMode = true;
      const testIds = args.slice(1);
      
      if (testIds.length === 0) {
        console.error('Error: Please provide decision IDs for testing.');
        console.log('Usage: node decision_details.js --test 115010 115187 115178');
        process.exit(1);
      }

      console.log(`\n=== TEST MODE ===`);
      console.log(`Testing with ${testIds.length} decision ID(s): ${testIds.join(', ')}\n`);

      // Create mock decision objects from IDs
      decisions = testIds.map(id => ({
        ID: id,
        CODE: `TEST-${id}`,
        NAME: `Test Decision ${id}`,
        AGENCY_ID: '',
        AGENCY_NAME: 'Test Agency'
      }));

    } else {
      // Normal mode: load from raw_result.json
      const rawResultPath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'result', 'thutuc.dichvucong.gov.vn', 'p', 'home', 'dvc-tthc-quyet-dinh-cong-bo', 'raw_result.json');
      
      if (!fs.existsSync(rawResultPath)) {
        console.error('Error: raw_result.json not found. Please run crawl_decisions.js first.');
        console.log('\nAlternatively, use test mode:');
        console.log('  node decision_details.js --test 115010 115187');
        process.exit(1);
      }

      decisions = JSON.parse(fs.readFileSync(rawResultPath, 'utf-8'));
      console.log(`Loaded ${decisions.length} decisions from raw_result.json`);
    }

    // Crawl details
    await crawler.crawlAllDetails(decisions, {
      batchSize: testMode ? 3 : 5  // Smaller batch size for testing
    });

    if (testMode) {
      // Test mode: print to console
      console.log('\n=== TEST RESULTS ===\n');
      console.log(JSON.stringify(crawler.detailedDecisions, null, 2));
      console.log('\n=== END TEST RESULTS ===\n');
    } else {
      // Normal mode: save to file
      const outputPath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'result', 'thutuc.dichvucong.gov.vn', 'p', 'home', 'dvc-tthc-quyet-dinh-cong-bo', 'detailed_result.json');
      crawler.saveResults(outputPath);
    }

    // Print statistics
    crawler.printStats();

  } catch (error) {
    console.error('Crawling failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = DecisionDetailCrawler;
