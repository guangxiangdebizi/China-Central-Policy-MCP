import axios from "axios";
import * as cheerio from "cheerio";
export const getPolicyFulltext = {
    name: "get_policy_fulltext",
    description: "Fetch policy full text and normalize into structured JSON (title, date, doc_no, body, issuer). Optimized for gov.cn pages.",
    parameters: {
        type: "object",
        properties: {
            url: { type: "string", description: "Policy page URL" },
            policy_id: { type: "string", description: "Optional internal policy id" }
        },
        required: ["url"]
    },
    async run(args) {
        try {
            if (!args.url)
                throw new Error("url is required");
            const html = await fetchHtml(args.url);
            const data = parseGovCnPolicyHtml(html, args.url);
            return {
                content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `❌ Failed: ${error.message}` }],
                isError: true
            };
        }
    }
};
async function fetchHtml(url) {
    const res = await axios.get(url, {
        responseType: "text",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        },
        timeout: 20000
    });
    return res.data;
}
function parseGovCnPolicyHtml(html, url) {
    const $ = cheerio.load(html);
    // Title extraction
    const title = $("h1").first().text().trim() ||
        $(".article .title").first().text().trim() ||
        $("title").first().text().trim();
    // Date extraction
    let date = $("time").attr("datetime") ||
        $(".meta .date").first().text().trim() ||
        $(".date").first().text().trim() ||
        extractDate($("body").text());
    // Issuer extraction
    const issuer = $(".source, .publisher, .department, .origin").first().text().trim() ||
        inferIssuerFromText($("body").text());
    // Document number extraction (e.g., 国发〔2023〕X号)
    const docNo = $(".doc-no, .docnum, .docNo").first().text().trim() ||
        extractDocNo($("body").text());
    // Body extraction
    let body = $("article").text().trim();
    if (!body)
        body = $(".content").text().trim();
    if (!body)
        body = $(".article").text().trim();
    if (!body)
        body = $("body").text().trim();
    return {
        policy_id: url,
        title,
        date: normalizeDate(date),
        doc_no: docNo,
        issuer,
        url,
        body
    };
}
function extractDate(text) {
    const m = text.match(/(20\d{2})[年\-\.\/]\s?(\d{1,2})[月\-\.\/]\s?(\d{1,2})[日]?/);
    if (!m)
        return "";
    const [_, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function normalizeDate(s) {
    if (!s)
        return "";
    const m = s.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m)
        return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    const cn = s.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
    if (cn)
        return `${cn[1]}-${cn[2].padStart(2, "0")}-${cn[3].padStart(2, "0")}`;
    return s.trim();
}
function extractDocNo(text) {
    const patterns = [
        /([\u4e00-\u9fa5]{2,4}\s?发\s?〔\s?20\d{2}\s?〕\s?\d+\s?号)/, // 国发〔2023〕X号
        /(银发\s?〔\s?20\d{2}\s?〕\s?\d+\s?号)/,
        /(财税\s?〔\s?20\d{2}\s?〕\s?\d+\s?号)/
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m)
            return m[1].replace(/\s+/g, "");
    }
    return "";
}
function inferIssuerFromText(text) {
    const patterns = [
        /(国务院)/,
        /(全国人民代表大会)/,
        /(中国人民银行)/,
        /(国家发展和改革委员会)/,
        /(财政部)/
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m)
            return m[1];
    }
    return "";
}
