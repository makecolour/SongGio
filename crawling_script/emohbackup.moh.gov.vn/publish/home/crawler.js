const { count } = require("console");
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://emohbackup.moh.gov.vn/publish/doc/search";
const ATTACH_URL = "https://emohbackup.moh.gov.vn/publish/attach/getfile";
const OUTPUT_ROOT = path.resolve(__dirname, "../../../../result/emohbackup.moh.gov.vn/publish/home");
const https = require("https");

// agent that allows TLSv1
const agent = new https.Agent({ minVersion: "TLSv1" });

async function fetchPage(page = 0, size = 50) {
  const url = `${BASE_URL}?page=${page}&size=${size}&typeId=0&deptId=0&term=&isLaw=false&sortField=-PUBLISH_DATE&year=0&signerId=0&startPublishDate=&endPublishDate=`;
  try {
    const res = await fetch(url, { agent, headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { docs: data.data?.lstResult || [], nTotal: data.data?.nTotal || 0 };
  } catch (err) {
    console.error(`Error fetching page ${page}:`, err.message);
    return { docs: [], nTotal: 0 };
  }
}


// --- Download one attachment into documentId folder ---
async function downloadAttachment(attachment, documentId) {
  const url = `${ATTACH_URL}/${attachment.attachId}`;
  const fileName = attachment.fileName;

  const folderPath = path.join(OUTPUT_ROOT, "attachments", `documentId=${documentId}`);
  const filePath = path.join(folderPath, fileName);

  try {
    fs.mkdirSync(folderPath, { recursive: true });

    if (fs.existsSync(filePath)) {
      console.log(`Already downloaded: ${fileName} (doc ${documentId})`);
      return;
    }

    const res = await fetch(url, { agent });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    console.log(`Downloaded: ${fileName} → ${folderPath}`);
  } catch (err) {
    console.error(`Failed to download ${fileName} (doc ${documentId}):`, err.message);
  }
}

// --- Main orchestrator ---
async function main() {
  const pageSize = 50;
  const firstPage = await fetchPage(0, pageSize);
  let allDocs = [...firstPage.docs];

  const totalPages = Math.ceil(firstPage.nTotal / pageSize);
  console.log(`Total pages: ${totalPages}`);

  for (let p = 1; p < totalPages; p++) {
    const { docs } = await fetchPage(p, pageSize);
    allDocs = allDocs.concat(docs);
  }

  console.log("Total documents crawled:", allDocs.length);

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_ROOT, "document_raw_result.json"), JSON.stringify(allDocs, null, 2));

  let count = 0;
  for (let p = 0; p < totalPages; p++) {
    const { docs } = await fetchPage(p, pageSize);
    for (const doc of docs) {
      if (doc.attachments) {
        for (const att of doc.attachments) {
            await downloadAttachment(att, doc.documentId);
          }
        }
      }
    }
  console.log("Download complete.");
}

main();
