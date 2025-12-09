const fs = require('fs');
const path = require('path');

/**
 * Crawl decisions from thutuc.dichvucong.gov.vn
 */
class DecisionCrawler {
  constructor() {
    this.baseUrl = 'https://thutuc.dichvucong.gov.vn/jsp/rest.jsp';
    this.recordsPerPage = 50;
    this.allDecisions = [];
  }

  /**
   * Fetch decisions for a specific page
   * @param {number} pageIndex - Page number to fetch
   * @returns {Promise<Object>} API response
   */
  async fetchPage(pageIndex) {
    const params = {
      service: 'decision_publishment_advanced_search_service_v2',
      provider: 'dvcquocgia',
      type: 'ref',
      recordPerPage: this.recordsPerPage,
      pageIndex: pageIndex,
      keyword: '',
      agency_id: '-1',
      field_id: '-1',
      publishing_date: ''
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching page ${pageIndex}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculate total pages based on total records
   * @param {number} totalRecords - Total number of records
   * @returns {number} Total number of pages
   */
  calculateTotalPages(totalRecords) {
    return Math.ceil(totalRecords / this.recordsPerPage);
  }

  /**
   * Crawl all decisions from all pages
   * @returns {Promise<Array>} All decisions
   */
  async crawlAll() {
    console.log('Starting to crawl decisions...');
    
    // Fetch first page to get total count
    console.log('Fetching page 1...');
    const firstPage = await this.fetchPage(1);
    
    if (!Array.isArray(firstPage) || firstPage.length === 0) {
      console.log('No data found.');
      return [];
    }

    // Add first page results
    this.allDecisions.push(...firstPage);
    
    // Get total records from AMOUNT field
    const totalRecords = parseInt(firstPage[0].AMOUNT);
    const totalPages = this.calculateTotalPages(totalRecords);
    
    console.log(`Total records: ${totalRecords}`);
    console.log(`Total pages: ${totalPages}`);
    console.log(`Records per page: ${this.recordsPerPage}`);

    // Fetch remaining pages
    for (let page = 2; page <= totalPages; page++) {
      console.log(`Fetching page ${page}/${totalPages}...`);
      
      try {
        const pageData = await this.fetchPage(page);
        
        if (Array.isArray(pageData) && pageData.length > 0) {
          this.allDecisions.push(...pageData);
        }
        
        // Add delay to avoid overwhelming the server
        await this.delay(1000);
      } catch (error) {
        console.error(`Failed to fetch page ${page}:`, error.message);
        // Continue with next page even if one fails
      }
    }

    console.log(`\nCrawling completed! Total decisions collected: ${this.allDecisions.length}`);
    return this.allDecisions;
  }

  /**
   * Delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Save results to JSON file
   * @param {string} outputPath - Path to save the file
   */
  saveToFile(outputPath) {
    const dir = path.dirname(outputPath);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(this.allDecisions, null, 2), 'utf-8');
    console.log(`\nResults saved to: ${outputPath}`);
  }

  /**
   * Save results to CSV file
   * @param {string} outputPath - Path to save the file
   */
  saveToCSV(outputPath) {
    if (this.allDecisions.length === 0) {
      console.log('No data to save to CSV.');
      return;
    }

    const dir = path.dirname(outputPath);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Get headers from first record
    const headers = Object.keys(this.allDecisions[0]);
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    this.allDecisions.forEach(decision => {
      const row = headers.map(header => {
        const value = decision[header] || '';
        // Escape quotes and wrap in quotes if contains comma
        const escaped = value.toString().replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      });
      csvContent += row.join(',') + '\n';
    });

    fs.writeFileSync(outputPath, csvContent, 'utf-8');
    console.log(`CSV saved to: ${outputPath}`);
  }

  /**
   * Print statistics
   */
  printStats() {
    console.log('\n=== Statistics ===');
    console.log(`Total decisions: ${this.allDecisions.length}`);
    
    if (this.allDecisions.length > 0) {
      // Count by agency
      const agencyCounts = {};
      this.allDecisions.forEach(decision => {
        const agency = decision.AGENCY_NAME;
        agencyCounts[agency] = (agencyCounts[agency] || 0) + 1;
      });
      
      console.log(`\nTop 10 agencies by decision count:`);
      const sortedAgencies = Object.entries(agencyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      sortedAgencies.forEach(([agency, count], index) => {
        console.log(`${index + 1}. ${agency}: ${count}`);
      });
    }
  }
}

// Main execution
async function main() {
  const crawler = new DecisionCrawler();
  
  try {
    // Crawl all decisions
    await crawler.crawlAll();
    
    // Save to file
    const resultDir = path.join(__dirname, '..', 'result', 'thutuc.dichvucong.gov.vn', 'p', 'home', 'dvc-tthc-quyet-dinh-cong-bo');
    
    crawler.saveToFile(path.join(resultDir, 'raw_result.json'));
    
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

module.exports = DecisionCrawler;
