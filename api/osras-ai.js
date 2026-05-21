const MODEL = "gemini-2.5-flash-lite";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const action = String(body.action || "").trim();

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "缺少 GEMINI_API_KEY，請到 Vercel Environment Variables 設定"
      });
    }

    if (!action) {
      return res.status(400).json({
        error: "缺少 action，可用值：generateRow / controlProposal / audit",
        receivedBody: body
      });
    }

    let prompt = "";

    if (action === "generateRow") {
      const jobTitle = String(body.jobTitle || "").trim();

      if (!jobTitle) {
        return res.status(400).json({
          error: "缺少 jobTitle"
        });
      }

      prompt = `你是一位專業 ISO 45001 職業安全衛生管理師、風險評估專家與台灣職安法規查核專家。

請針對作業名稱：「${jobTitle}」產生一筆完整的職安危害辨識與風險評估資料。

請依據：
- 台灣職業安全衛生法
- 職業安全衛生設施規則
- 營造安全衛生設施規則
- ISO 45001
- Hierarchy of Controls 風險控制層級

嚴重度 severity_1、severity_2 限制為 1-4。
可能性 probability_1、probability_2 限制為 1-4。

請只輸出純 JSON，不要 markdown，不要說明文字。

JSON 格式如下：
{
  "job_title": "${jobTitle}",
  "cycle": "經常性/非經常性",
  "environment": "作業環境",
  "machinery": "機械/設備",
  "chemical": "能源/化學品",
  "qualification": {
    "checked": true,
    "license": "需要的法定資格或證照，若無則填無"
  },
  "hazard_type": "危害類型",
  "scenario": "事故可能造成之情境描述，需符合勞檢標準，50-120字",
  "existing_eng": "現有工程控制",
  "existing_admin": "現有管理控制",
  "existing_ppe": "現有個人防護具",
  "severity_1": 1,
  "probability_1": 1,
  "control_proposal": "工程控制：...\\n管理控制：...\\n個人防護具：...",
  "severity_2": 1,
  "probability_2": 1
}`;
    }

    else if (action === "controlProposal") {
      const row = body.row || {};

      if (!row.job_title) {
        return res.status(400).json({
          error: "缺少 row.job_title",
          receivedRow: row
        });
      }

      prompt = `你是一位專業職業安全工程師與 ISO 45001 風險控制專家。

請根據以下職安風險評估資料，產生符合 Hierarchy of Controls 的降低風險控制措施。

請注意：
1. 優先考量消除、取代、工程控制。
2. 不可只用 PPE 就大幅降低風險。
3. 控制後嚴重度 severity_2 與可能性 probability_2 必須合理。
4. 嚴重度與可能性只能是 1-4 的整數。

待分析資料：
${JSON.stringify(row)}

請只輸出純 JSON，不要 markdown，不要說明文字。

JSON 格式如下：
{
  "control_proposal": "工程控制：...\\n管理控制：...\\n個人防護具：...",
  "severity_2": 1,
  "probability_2": 1,
  "reason": "簡短說明為何如此調整控制後風險"
}`;
    }

    else if (action === "audit") {
      const rows = Array.isArray(body.rows) ? body.rows : [];

      if (rows.length === 0) {
        return res.status(400).json({
          error: "缺少 rows，或 rows 為空陣列"
        });
      }

      prompt = `你是一位極度嚴謹的 ISO 45001 與台灣職業安全衛生法規稽核專家。

請對以下職業安全危害辨識與風險評估表進行深度稽核。

稽核重點：
1. 作業名稱、危害類型、事故情境是否合理。
2. 嚴重度 S 與可能性 P 是否低估。
3. 初始高風險或重大風險是否有足夠控制措施。
4. 控制措施是否符合 Hierarchy of Controls。
5. 是否過度依賴 PPE。
6. 控制後風險是否不合理下降。
7. 是否遺漏法定證照或特殊作業資格。
8. 是否有法規適用或違反疑慮。

待稽核資料：
${JSON.stringify(rows)}

請只輸出純 JSON 陣列，不要 markdown，不要說明文字。

JSON 格式如下：
[
  {
    "rowId": "項次",
    "level": "critical/warning/success",
    "type": "缺失類別",
    "msg": "風險與問題說明",
    "suggestion": "具體改善建議",
    "regulation": "可能適用法規，若無則填無"
  }
]

若完全沒有問題，請回傳：
[
  {
    "rowId": "All",
    "level": "success",
    "type": "審查通過",
    "msg": "未發現明顯邏輯瑕疵",
    "suggestion": "",
    "regulation": "無"
  }
]`;
    }

    else {
      return res.status(400).json({
        error: "不支援的 action",
        allowedActions: ["generateRow", "controlProposal", "audit"]
      });
    }

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 2048,
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", JSON.stringify(data, null, 2));

      return res.status(response.status).json({
        error: data.error || data,
        model: MODEL
      });
    }

    let rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    rawText = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let result;

    try {
      result = JSON.parse(rawText);
    } catch (parseError) {
      return res.status(500).json({
        error: "AI 回傳 JSON 解析失敗",
        rawText,
        model: MODEL
      });
    }

    return res.status(200).json({
      ok: true,
      action,
      model: MODEL,
      result
    });
  } catch (error) {
    console.error("Server Error:", error);

    return res.status(500).json({
      error: error.message,
      model: MODEL
    });
  }
}
