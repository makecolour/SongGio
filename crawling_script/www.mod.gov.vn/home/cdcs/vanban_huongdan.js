const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.mod.gov.vn/home/cdcs';
const OUTPUT_DIR = path.join(__dirname, '../../../result/www.mod.gov.vn/home/cdcs');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 2000, max = 5000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanLikeScroll(page) {
    // Scroll down in chunks to simulate human reading
    await page.evaluate(async () => {
        const scrollHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const scrollSteps = Math.floor(scrollHeight / viewportHeight) + 1;
        
        for (let i = 0; i < scrollSteps; i++) {
            const scrollTo = Math.min((i + 1) * viewportHeight * 0.7, scrollHeight);
            window.scrollTo({
                top: scrollTo,
                behavior: 'smooth'
            });
            // Random pause between scroll steps
            await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 300));
        }
    });
    
    // Random pause at bottom
    await sleep(randomDelay(500, 1500));
    
    // Scroll back to top
    await page.evaluate(() => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    await sleep(randomDelay(300, 800));
}

async function scrapeTableData(page) {
    return await page.evaluate(() => {
        const rows = [];
        const tableRows = document.querySelectorAll('table.table-bordered tr.bgTable');
        
        tableRows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 4) {
                const stt = cells[0].innerText.trim();
                const soKyHieu = cells[1].innerText.trim();
                const ngayBanHanh = cells[2].innerText.trim();
                const trichYeu = cells[3].innerText.trim();
                
                // Extract URL from the link
                const linkElement = cells[1].querySelector('a');
                const detailUrl = linkElement ? linkElement.getAttribute('href') : '';
                
                rows.push({
                    STT: stt,
                    SO_KY_HIEU: soKyHieu,
                    NGAY_BAN_HANH: ngayBanHanh,
                    TRICH_YEU: trichYeu,
                    DETAIL_URL: detailUrl,
                    FULL_URL: detailUrl ? (detailUrl.startsWith('http') ? detailUrl : `https://www.mod.gov.vn${detailUrl}`) : ''
                });
            }
        });
        
        return rows;
    });
}

async function getPageLinks(page) {
    return await page.evaluate(() => {
        const pageLinks = [];
        const paginationDiv = document.querySelector('.page');
        
        if (paginationDiv) {
            const links = paginationDiv.querySelectorAll('a');
            links.forEach(link => {
                const href = link.getAttribute('href');
                const text = link.innerText.trim();
                if (href && text && text !== '<<' && text !== '>>' && !isNaN(text)) {
                    pageLinks.push({
                        page: parseInt(text),
                        url: href
                    });
                }
            });
        }
        
        return pageLinks;
    });
}

async function getCurrentPage(page) {
    return await page.evaluate(() => {
        const paginationDiv = document.querySelector('.page');
        if (paginationDiv) {
            const currentPageSpan = Array.from(paginationDiv.querySelectorAll('span')).find(span => {
                return !span.querySelector('a') && span.innerText.trim() && !isNaN(span.innerText.trim());
            });
            return currentPageSpan ? parseInt(currentPageSpan.innerText.trim()) : 1;
        }
        return 1;
    });
}

async function getTotalPages(page) {
    return await page.evaluate(() => {
        const paginationDiv = document.querySelector('.page');
        if (paginationDiv) {
            const spans = paginationDiv.querySelectorAll('span');
            let maxPage = 1;
            
            spans.forEach(span => {
                const link = span.querySelector('a');
                const text = link ? link.innerText.trim() : span.innerText.trim();
                if (text && !isNaN(text)) {
                    const pageNum = parseInt(text);
                    if (pageNum > maxPage) {
                        maxPage = pageNum;
                    }
                }
            });
            
            return maxPage;
        }
        return 1;
    });
}

async function clickNextPage(page) {
    return await page.evaluate(() => {
        const paginationDiv = document.querySelector('.page');
        if (paginationDiv) {
            const spans = Array.from(paginationDiv.querySelectorAll('span'));
            
            // Find current page index
            let currentIndex = -1;
            spans.forEach((span, index) => {
                if (!span.querySelector('a') && span.innerText.trim() && !isNaN(span.innerText.trim())) {
                    currentIndex = index;
                }
            });
            
            // Click the next available link after current page
            if (currentIndex >= 0 && currentIndex + 1 < spans.length) {
                const nextSpan = spans[currentIndex + 1];
                const nextLink = nextSpan.querySelector('a');
                if (nextLink) {
                    nextLink.click();
                    return true;
                }
            }
        }
        return false;
    });
}

async function saveProgress(allResults, currentPageNum) {
    const outputFile = path.join(OUTPUT_DIR, 'raw_result.json');
    fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2), 'utf-8');
    
    const summaryFile = path.join(OUTPUT_DIR, 'pages.json');
    const summary = {
        total_pages: currentPageNum,
        total_rows: allResults.length,
        scraped_at: new Date().toISOString(),
        base_url: BASE_URL,
        last_page_scraped: currentPageNum
    };
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`Progress saved: ${allResults.length} rows (page ${currentPageNum})`);
}

async function scrapeAllPages() {
    console.log('Starting scraper for www.mod.gov.vn/home/cdcs');
    
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set a reasonable timeout
    page.setDefaultTimeout(30000);
    
    // Handle service unavailable errors
    page.on('response', response => {
        if (response.status() === 503) {
            console.warn(`⚠️ HTTP 503 Service Unavailable: ${response.url()}`);
        }
    });
    
    try {
        console.log(`Navigating to ${BASE_URL}`);
        
        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries) {
            try {
                await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
                break;
            } catch (error) {
                retries++;
                console.error(`Navigation attempt ${retries} failed:`, error.message);
                if (retries >= maxRetries) {
                    throw new Error(`Failed to load page after ${maxRetries} attempts`);
                }
                console.log(`Retrying in 5 seconds...`);
                await sleep(5000);
            }
        }
        
        // Wait for the table to load
        await page.waitForSelector('table.table-bordered', { timeout: 10000 });
        await sleep(2000);
        
        const allResults = [];
        let currentPageNum = 1;
        let totalPages = await getTotalPages(page);
        
        console.log(`Total pages detected: ${totalPages}`);
        
        while (true) {
            console.log(`Scraping page ${currentPageNum}...`);
            
            try {
                // Wait for table to be ready
                await page.waitForSelector('table.table-bordered tr.bgTable', { timeout: 10000 });
                await sleep(randomDelay(800, 1500));
                
                // Simulate human-like scrolling
                console.log('Scrolling through page...');
                await humanLikeScroll(page);
                
                // Scrape current page
                const pageData = await scrapeTableData(page);
                console.log(`Found ${pageData.length} rows on page ${currentPageNum}`);
                
                // Add page number to each row
                pageData.forEach(row => {
                    row.CRAWLED_FROM_PAGE = currentPageNum;
                });
                
                allResults.push(...pageData);
                
                // Save progress after each page
                await saveProgress(allResults, currentPageNum);
                
            } catch (error) {
                console.error(`Error scraping page ${currentPageNum}:`, error.message);
                console.log('Saving progress before potential retry...');
                await saveProgress(allResults, currentPageNum);
                
                // If we got data from previous pages, continue to next
                if (allResults.length > 0) {
                    console.log('Attempting to continue to next page...');
                } else {
                    throw error;
                }
            }
            
            // Check if we've reached the last page
            const detectedCurrentPage = await getCurrentPage(page);
            console.log(`Current page number: ${detectedCurrentPage}, Total pages: ${totalPages}`);
            
            if (detectedCurrentPage >= totalPages) {
                console.log('Reached last page');
                break;
            }
            
            // Random delay before clicking next page
            const beforeClickDelay = randomDelay(1500, 4000);
            console.log(`Waiting ${Math.round(beforeClickDelay / 1000)}s before navigating to next page...`);
            await sleep(beforeClickDelay);
            
            // Try to click next page
            console.log('Attempting to navigate to next page...');
            const clicked = await clickNextPage(page);
            
            if (!clicked) {
                console.log('Could not find next page link, stopping');
                break;
            }
            
            // Wait for navigation and new content to load with retry logic
            let navigationSuccess = false;
            let navRetries = 0;
            const maxNavRetries = 3;
            
            while (!navigationSuccess && navRetries < maxNavRetries) {
                try {
                    await sleep(randomDelay(2000, 4000));
                    await page.waitForSelector('table.table-bordered tr.bgTable', { timeout: 15000 });
                    await sleep(randomDelay(500, 1200));
                    navigationSuccess = true;
                } catch (error) {
                    navRetries++;
                    console.warn(`Navigation wait failed (attempt ${navRetries}/${maxNavRetries}):`, error.message);
                    
                    if (navRetries >= maxNavRetries) {
                        console.error('Failed to load next page, saving progress and stopping');
                        await saveProgress(allResults, currentPageNum);
                        break;
                    }
                    
                    console.log('Waiting 5 seconds before retry...');
                    await sleep(5000);
                }
            }
            
            if (!navigationSuccess) {
                break;
            }
            
            currentPageNum++;
            
            // Safety check to prevent infinite loop
            if (currentPageNum > 50) {
                console.log('Safety limit reached (50 pages), stopping');
                break;
            }
        }
        
        // Final save
        await saveProgress(allResults, currentPageNum);
        
        console.log(`\n✅ Scraping completed!`);
        console.log(`Total rows scraped: ${allResults.length}`);
        console.log(`Total pages scraped: ${currentPageNum}`);
        console.log(`Saved to: ${path.join(OUTPUT_DIR, 'raw_result.json')}`);
        
    } catch (error) {
        console.error('Error during scraping:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

// Run the scraper
scrapeAllPages().catch(console.error);
