/**
 * Browser Console Script for vanban.chinhphu.vn
 * 
 * HOW TO USE:
 * 1. Open https://vanban.chinhphu.vn/ in your browser
 * 2. Open Developer Tools (F12)
 * 3. Go to Console tab
 * 4. Copy and paste this entire script
 * 5. Press Enter to run
 * 6. The script will automatically persist across page loads
 * 7. Manually navigate pages OR type vanbanCrawler.autoCrawlPages(10) to auto-crawl
 * 8. Download JSON when done with vanbanCrawler.downloadJSON()
 */

(function() {
  'use strict';

  // Storage key for persistence
  const STORAGE_KEY = 'vanban_crawler_data';
  
  const crawler = {
    baseUrl: 'https://vanban.chinhphu.vn',
    allDocuments: [],
    totalDocuments: 0,
    autoCrawlEnabled: false,
    autoCrawlMaxPages: null,
    autoCrawlDelay: 2000,
    
    /**
     * Initialize - load from localStorage
     */
    init() {
      this.loadFromStorage();
      
      // Auto-crawl current page if enabled
      if (this.autoCrawlEnabled) {
        console.log(`Auto-crawl active (page ${this.getCurrentPageNumber()})`);
        setTimeout(() => {
          this.crawlCurrentPage();
          this.checkAndGoToNextPage();
        }, 1000);
      }
      
      console.log(`Loaded ${this.allDocuments.length} documents from storage`);
    },
    
    /**
     * Get current page number from URL or pagination
     */
    getCurrentPageNumber() {
      // Try to find active page in pagination
      const activePage = document.querySelector('.grid-pager span');
      if (activePage) {
        return parseInt(activePage.textContent) || 1;
      }
      return 1;
    },
    
    /**
     * Save to localStorage
     */
    saveToStorage() {
      const data = {
        allDocuments: this.allDocuments,
        totalDocuments: this.totalDocuments,
        autoCrawlEnabled: this.autoCrawlEnabled,
        autoCrawlMaxPages: this.autoCrawlMaxPages,
        autoCrawlDelay: this.autoCrawlDelay
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },
    
    /**
     * Load from localStorage
     */
    loadFromStorage() {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.allDocuments = data.allDocuments || [];
        this.totalDocuments = data.totalDocuments || 0;
        this.autoCrawlEnabled = data.autoCrawlEnabled || false;
        this.autoCrawlMaxPages = data.autoCrawlMaxPages || null;
        this.autoCrawlDelay = data.autoCrawlDelay || 2000;
      }
    },
    
    /**
     * Parse current page for documents
     */
    parseCurrentPage() {
      const documents = [];
      const currentPage = this.getCurrentPageNumber();
      
      // Extract total count from pagination
      const paginationText = document.querySelector('#document_page_info')?.textContent;
      if (paginationText) {
        const match = paginationText.match(/(\d+)\s*-\s*(\d+)\s*\|\s*(\d+)/);
        if (match) {
          this.totalDocuments = parseInt(match[3]);
        }
      }
      
      // Find the table
      const table = document.querySelector('table.search-result');
      if (!table) {
        console.error('Document table not found!');
        return documents;
      }
      
      // Get all rows (skip header)
      const rows = table.querySelectorAll('tr');
      
      rows.forEach((row) => {
        // Skip header row
        if (row.querySelector('th')) return;
        
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) return;
        
        // Extract link with pageid and docid
        const link = cells[0].querySelector('a[href*="pageid"]');
        if (!link) return;
        
        const href = link.getAttribute('href');
        const linkMatch = href.match(/pageid=(\d+)&(?:amp;)?docid=(\d+)/);
        if (!linkMatch) return;
        
        const pageId = linkMatch[1];
        const docId = linkMatch[2];
        
        // Check if already crawled
        const exists = this.allDocuments.some(d => d.PAGE_ID === pageId && d.DOC_ID === docId);
        if (exists) return;
        
        // Extract code
        const codeEl = cells[0].querySelector('.code');
        const code = codeEl ? codeEl.textContent.trim() : '';
        
        // Extract issue date
        const issueDateEl = cells[0].querySelector('.issue-v2');
        const issueDate = issueDateEl ? issueDateEl.textContent.trim() : '';
        
        // Extract issued date (from column 2)
        const issuedDateEl = cells[1].querySelector('.issued-date');
        const issuedDate = issuedDateEl ? issuedDateEl.textContent.trim() : issueDate;
        
        // Extract summary
        const summaryEl = cells[2].querySelector('.substract');
        const summary = summaryEl ? summaryEl.textContent.trim() : '';
        
        // Extract attachments
        const attachments = [];
        const attachmentLinks = cells[2].querySelectorAll('.bl-doc-file a[download]');
        attachmentLinks.forEach(a => {
          const url = a.getAttribute('href');
          attachments.push({
            url: url,
            label: a.textContent.trim(),
            filename: url.split('/').pop()
          });
        });
        
        documents.push({
          PAGE_ID: pageId,
          DOC_ID: docId,
          CODE: code,
          ISSUE_DATE: issueDate,
          ISSUED_DATE: issuedDate,
          SUMMARY: summary,
          DETAIL_URL: `${this.baseUrl}/?pageid=${pageId}&docid=${docId}`,
          ATTACHMENTS: attachments,
          CRAWLED_FROM_PAGE: currentPage
        });
      });
      
      return documents;
    },
    
    /**
     * Crawl current page
     */
    crawlCurrentPage() {
      const docs = this.parseCurrentPage();
      this.allDocuments.push(...docs);
      this.saveToStorage();
      
      const currentPage = this.getCurrentPageNumber();
      console.log(`✓ Page ${currentPage}: ${docs.length} new documents (Total: ${this.allDocuments.length})`);
      
      return docs.length;
    },
    
    /**
     * Check if should go to next page and do it
     */
    checkAndGoToNextPage() {
      if (!this.autoCrawlEnabled) return;
      
      const currentPage = this.getCurrentPageNumber();
      
      // Check if reached max pages
      if (this.autoCrawlMaxPages && currentPage >= this.autoCrawlMaxPages) {
        console.log(`✓ Reached max pages: ${this.autoCrawlMaxPages}`);
        this.stopAutoCrawl();
        this.showStats();
        return;
      }
      
      // Find next page link
      const nextPageLink = document.querySelector(`a[href*="Page$${currentPage + 1}"]`);
      
      if (nextPageLink) {
        console.log(`→ Going to page ${currentPage + 1} in ${this.autoCrawlDelay}ms...`);
        setTimeout(() => {
          nextPageLink.click();
        }, this.autoCrawlDelay);
      } else {
        console.log('✓ No more pages. Crawl completed!');
        this.stopAutoCrawl();
        this.showStats();
      }
    },
    
    /**
     * Start auto-crawl mode
     */
    startAutoCrawl(maxPages = null, delayMs = 2000) {
      this.autoCrawlEnabled = true;
      this.autoCrawlMaxPages = maxPages;
      this.autoCrawlDelay = delayMs;
      this.saveToStorage();
      
      console.log('=== Auto-Crawl Started ===');
      console.log(`Max pages: ${maxPages || 'unlimited'}`);
      console.log(`Delay: ${delayMs}ms`);
      console.log('The script will persist across page loads.');
      console.log('To stop: vanbanCrawler.stopAutoCrawl()');
      
      // Crawl current page and move to next
      this.crawlCurrentPage();
      this.checkAndGoToNextPage();
    },
    
    /**
     * Stop auto-crawl mode
     */
    stopAutoCrawl() {
      this.autoCrawlEnabled = false;
      this.autoCrawlMaxPages = null;
      this.saveToStorage();
      console.log('Auto-crawl stopped.');
    },
    
    /**
     * Download results as JSON
     */
    downloadJSON(filename = 'raw_result.json') {
      const dataStr = JSON.stringify(this.allDocuments, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      console.log(`✓ Downloaded: ${filename} (${this.allDocuments.length} documents)`);
    },
    
    /**
     * Show statistics
     */
    showStats() {
      console.log('\n=== Statistics ===');
      console.log(`Total documents crawled: ${this.allDocuments.length}`);
      console.log(`Total documents on website: ${this.totalDocuments}`);
      
      if (this.allDocuments.length > 0) {
        const docsWithAttachments = this.allDocuments.filter(doc => doc.ATTACHMENTS.length > 0).length;
        const totalAttachments = this.allDocuments.reduce((sum, doc) => sum + doc.ATTACHMENTS.length, 0);
        
        console.log(`Documents with attachments: ${docsWithAttachments}`);
        console.log(`Total attachments: ${totalAttachments}`);
        
        // Page range
        const pages = [...new Set(this.allDocuments.map(d => d.CRAWLED_FROM_PAGE))].sort((a, b) => a - b);
        if (pages.length > 0) {
          console.log(`Pages crawled: ${pages[0]} to ${pages[pages.length - 1]}`);
        }
      }
    },
    
    /**
     * Reset crawler and clear storage
     */
    reset() {
      this.allDocuments = [];
      this.totalDocuments = 0;
      this.autoCrawlEnabled = false;
      this.autoCrawlMaxPages = null;
      localStorage.removeItem(STORAGE_KEY);
      console.log('✓ Crawler reset. All data cleared.');
    }
  };
  
  // Initialize on page load
  crawler.init();
  
  // Make crawler available globally
  window.vanbanCrawler = crawler;
  
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║    VanBan Chinhphu.vn Browser Crawler (Persistent Mode)       ║
╚════════════════════════════════════════════════════════════════╝

Current Status:
• Documents collected: ${crawler.allDocuments.length}
• Auto-crawl: ${crawler.autoCrawlEnabled ? 'ACTIVE' : 'inactive'}

COMMANDS:

1. Auto-Crawl (Recommended):
   vanbanCrawler.startAutoCrawl(10, 2000)  - Crawl 10 pages, 2s delay
   vanbanCrawler.startAutoCrawl(50)        - Crawl 50 pages
   vanbanCrawler.stopAutoCrawl()           - Stop auto-crawl
   
2. Manual:
   vanbanCrawler.crawlCurrentPage()        - Crawl current page only
   (Then navigate pages manually in browser)
   
3. Results:
   vanbanCrawler.showStats()               - Show statistics
   vanbanCrawler.downloadJSON()            - Download JSON file
   vanbanCrawler.allDocuments              - View all data
   
4. Utility:
   vanbanCrawler.reset()                   - Clear all data

💡 TIP: Auto-crawl persists across page loads!
   Just run startAutoCrawl() once and let it work.
  `);
})();
