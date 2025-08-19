import axios from "axios";
import * as cheerio from "cheerio";

export const getLatestPolicies = {
  name: "get_latest_policies",
  description: "Search State Council policies using gov.cn official search API with keyword search and date filtering.",
  parameters: {
    type: "object",
    properties: {
      startdate: {
        type: "string",
        description: "Start date in YYYY-MM-DD format"
      },
      enddate: {
        type: "string",
        description: "End date in YYYY-MM-DD format"
      },
      limit: {
        type: "number",
        description: "Max number of items to return (default: 100, max: 100)",
        default: 100
      },
      keyword: {
        type: "string",
        description: "Keyword to search in policy content, titles and summaries"
      }
    },
    required: []
  },

  async run(args: { startdate?: string; enddate?: string; limit?: number; keyword?: string }) {
    try {
      const limit = Math.max(1, Math.min(args.limit ?? 100, 100));
      // 规范化关键词：去除首尾空白与重复空白
      const normalizedKeyword = args.keyword?.trim().replace(/\s+/g, " ");
      
      // If keyword is provided, use official search API
      if (normalizedKeyword) {
        const { items, debug } = await searchPolicyAPI(normalizedKeyword, limit, args.startdate, args.enddate);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ 
              source: "gov_cn_search_api", 
              search_method: "official_search_api",
              count: items.length,
              filters: {
                startdate: args.startdate,
                enddate: args.enddate,
                keyword: normalizedKeyword
              },
              items,
              debug
            }, null, 2)
          }]
        };
      } else {
        // If no keyword, fallback to latest policies list
        const items = await fetchFromGovCnLatest(limit, args.startdate, args.enddate);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ 
              source: "gov_cn_latest", 
              search_method: "latest_policies_list",
              count: items.length,
              filters: {
                startdate: args.startdate,
                enddate: args.enddate,
                keyword: args.keyword
              },
              items 
            }, null, 2)
          }]
        };
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `❌ Failed to fetch policies: ${error.message}` }],
        isError: true
      };
    }
  }
};

// Use official gov.cn search API
async function searchPolicyAPI(keyword: string, limit: number, startdate?: string, enddate?: string) {
  const items: any[] = [];
  const requestedUrls: string[] = [];
  const page = 1;
  const pageSize = 100; // 固定为100，只请求第一页

  try {
    // Build search API URL (only first page with n=100)
    const searchUrl = "https://sousuo.www.gov.cn/search-gov/data";
    const params = new URLSearchParams({
      't': 'zhengcelibrary_gw_bm_gb',
      'q': keyword,
      'searchfield': 'title:content:summary',
      'sort': 'score',
      'sortType': '1',
      'p': page.toString(),
      'n': pageSize.toString(),
      'timetype': 'timezd'
    });

    // Add date range if provided
    if (startdate) params.append('mintime', startdate);
    if (enddate) params.append('maxtime', enddate);

    const url = `${searchUrl}?${params.toString()}`;
    requestedUrls.push(url);

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": "https://sousuo.www.gov.cn/"
      },
      timeout: 15000
    });

    // Parse JSON response (handle string payloads)
    const raw = response.data;
    let data: any;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw; // keep as string for debug
      }
    } else {
      data = raw;
    }
    // facets deprecated per product requirement

    // Case 1: legacy/alternative structure with `results`
    if (data && Array.isArray(data.results)) {
      for (const result of data.results) {
        if (items.length >= pageSize) break;
        const policy = {
          policy_id: result.url || result.link || "",
          title: sanitizeHtmlText(result.title || ""),
          level: "state_council",
          category: "government_policy",
          date: formatDate(result.pubtime || result.publishtime || result.time || ""),
          source: "gov_cn_search_api",
          url: normalizeUrl(result.url || result.link || ""),
          summary: sanitizeHtmlText(result.summary || result.content || ""),
          issuing_agency: result.puborg || result.source || "国务院",
          document_number: result.pubnum || "",
          file_type: result.filetype || "html"
        };
        if (!policy.title || !policy.url || policy.title.length < 3) continue;
        items.push(policy);
      }
    }

    // Case 2: current official structure with `catMap.*.listVO` (parse regardless of results)
    const catMapDebug: Record<string, number> = {};
    // locate catMap at common locations
    const catMapCandidate: any = (data && (data.catMap || data?.searchVO?.catMap || data?.data?.catMap)) || undefined;
    if (catMapCandidate && typeof catMapCandidate === "object") {
      const catEntries: Array<[string, any]> = Object.entries(catMapCandidate).filter(([, v]: any) => v && Array.isArray(v.listVO));
      for (const [catKey, cat] of catEntries) {
        catMapDebug[catKey] = Array.isArray(cat.listVO) ? cat.listVO.length : 0;
        for (const result of cat.listVO) {
          if (items.length >= pageSize) break;
          const url2 = normalizeUrl(result.url || result.link || "");
          const title = sanitizeHtmlText((result.title || "").toString());

          const dateFromEpoch = formatDateFromEpoch(result.ptime || result.pubtime);
          const date = dateFromEpoch || formatDate(result.pubtimeStr || result.publishtime || result.time || "");

          const policy = {
            policy_id: url2,
            title: title,
            level: "state_council",
            category: "government_policy",
            date: date,
            source: "gov_cn_search_api",
            url: url2,
            summary: sanitizeHtmlText(result.summary || result.content || ""),
            issuing_agency: result.puborg || result.source || "国务院",
            document_number: result.pcode || result.pubnum || "",
            file_type: result.filetype || result.wjlx || "html",
            catalog: cat.catName || undefined
          };

          if (!policy.title || !policy.url || policy.title.length < 3) continue;
          items.push(policy);
        }
        if (items.length >= pageSize) break;
      }
    }

    return { items: items.slice(0, limit), debug: { requested_urls: requestedUrls, page_size: pageSize, page, catmap_list_lengths: catMapDebug, raw_type: typeof raw } };

  } catch (error) {
    console.error(`Error searching API page ${page}:`, error);
    try {
      const fallbackItems = await searchPolicyFallback(keyword, Math.min(limit, 20));
      return { items: fallbackItems, debug: { requested_urls: requestedUrls, used_fallback: true } };
    } catch (fallbackError) {
      console.error("Fallback method also failed:", fallbackError);
      return { items: [], debug: { requested_urls: requestedUrls, error: String(error) } };
    }
  }
}

function sanitizeHtmlText(value: any): string {
  if (!value) return "";
  try {
    const $ = cheerio.load(`<div>${value}</div>`);
    return $('div').text().trim();
  } catch {
    return String(value).replace(/<[^>]*>/g, '').trim();
  }
}

// facets removed

// Fallback method using HTML parsing
async function searchPolicyFallback(keyword: string, limit: number) {
  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const searchUrl = `https://sousuo.www.gov.cn/zcwjk/policyDocumentLibrary?t=zhengcelibrary&q=${encodedKeyword}`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    const items: any[] = [];
    
    // Try different selectors for search results
    const selectors = [".result-item", ".search-result", ".policy-item", ".list-item"];
    
    for (const selector of selectors) {
      $(selector).each((_, element) => {
        if (items.length >= limit) return false;
        
        const $item = $(element);
        const $link = $item.find("a").first();
        const title = $link.text().trim();
        const url = normalizeUrl($link.attr("href") || "");
        
        if (!title || !url || title.length < 3) return;
        
        // Extract date
        const dateText = $item.text();
        const date = extractDateFromText(dateText);
        
        items.push({
          policy_id: url,
          title: title,
          level: "state_council",
          category: "government_policy",
          date: date,
          source: "gov_cn_fallback",
          url: url,
          summary: $item.find(".summary, .description").text().trim() || ""
        });
      });
      
      if (items.length > 0) break;
    }
    
    return items;
  } catch (error) {
    console.error("Fallback method failed:", error);
    return [];
  }
}

// Helper functions
function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  
  // Try different date formats
  const patterns = [
    /(\d{4})-(\d{1,2})-(\d{1,2})/,  // YYYY-MM-DD
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,  // YYYY年MM月DD日
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,   // YYYY/MM/DD
    /(\d{4})\.(\d{1,2})\.(\d{1,2})/   // YYYY.MM.DD
  ];
  
  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      const [_, year, month, day] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  
  return dateStr;
}

function formatDateFromEpoch(epochMaybe: unknown): string {
  if (typeof epochMaybe === "number" && isFinite(epochMaybe)) {
    const d = new Date(epochMaybe);
    if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  if (typeof epochMaybe === "string" && /^(\d{10}|\d{13})$/.test(epochMaybe)) {
    const num = epochMaybe.length === 10 ? Number(epochMaybe) * 1000 : Number(epochMaybe);
    const d = new Date(num);
    if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return "";
}

function normalizeUrl(url: string): string {
  if (!url) return "";
  
  if (url.startsWith("//")) {
    return "https:" + url;
  } else if (url.startsWith("/")) {
    return "https://www.gov.cn" + url;
  } else if (!/^https?:\/\//i.test(url)) {
    return "https://www.gov.cn/" + url;
  }
  
  return url;
}

function extractDateFromText(text: string): string {
  const dateMatch = text.match(/(20\d{2})[年\-](\d{1,2})[月\-](\d{1,2})[日]?/);
  if (dateMatch) {
    const [_, y, m, d] = dateMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

// Fallback: fetch from latest policies list (original method)
async function fetchFromGovCnLatest(limit: number, startdate?: string, enddate?: string) {
  const items: any[] = [];
  const seen = new Set<string>();
  
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  
  if (startdate) startDate = new Date(startdate);
  if (enddate) endDate = new Date(enddate);
  
  let page = 1;
  
  while (items.length < limit && page <= 5) {
    const pageItems = await fetchGovCnPage(page);
    
    for (const item of pageItems) {
      if (items.length >= limit) break;
      
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      
      // Date filtering
      if (item.date) {
        const itemDate = new Date(item.date);
        
        if (startDate && itemDate < startDate) {
          continue;
        }
        
        if (endDate && itemDate > endDate) {
          continue;
        }
      }
      
      items.push(item);
    }
    
    page++;
    
    if (pageItems.length === 0) {
      break;
    }
  }

  return items.slice(0, limit);
}

async function fetchGovCnPage(pageNum: number) {
  const baseUrl = "https://www.gov.cn/zhengce/zuixin/";
  const url = pageNum === 1 ? baseUrl : `${baseUrl}index_${pageNum}.htm`;
  
  try {
    const res = await axios.get(url, {
      responseType: "text",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout: 10000
    });
    
    const html = res.data as string;
    const $ = cheerio.load(html);

    const items: any[] = [];

    const selectors = [
      ".news_list li",
      ".list li", 
      "ul li",
      "li"
    ];

    let found = false;
    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const li = $(el);
        const a = li.find("a").first();
        const title = a.text().trim();
        let href = a.attr("href") || "";
        
        if (!title || !href || title.length < 5) return;

        // Normalize URL
        href = normalizeUrl(href);

        // Extract date
        const date = extractDateFromText(li.text());

        items.push({
          policy_id: href,
          title: title,
          level: "state_council",
          category: "government_policy",
          date: date,
          source: "gov_cn_latest",
          url: href
        });
        
        found = true;
      });
      
      if (found && items.length > 0) break;
    }

    return items;
    
  } catch (error) {
    console.error(`Failed to fetch page ${pageNum}:`, error);
    return [];
  }
}