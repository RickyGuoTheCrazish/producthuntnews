// ChatGPT Analysis Service - Analyze products for target user demographics
const OpenAI = require('openai');

class ChatGPTService {
  constructor() {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key') {
      console.warn('OpenAI API key not configured. ChatGPT analysis will not be available.');
      this.openai = null;
    } else {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    this.model = 'gpt-4o'; // Using GPT-4o as requested
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds
  }

  // Create optimized analysis prompt for a product (with Chinese translation)
  createAnalysisPrompt(product) {
    return `Analyze this Product Hunt product for target users and market insights. Provide response in Chinese except for the product name:

Product: ${product.name}
Tagline: ${product.tagline}
Votes: ${product.votesCount} | Comments: ${product.commentsCount}
Topics: ${product.topics?.map(t => t.name).join(', ') || 'None'}

Return JSON with Chinese content (except productName):
{
  "productName": "${product.name}",
  "targetUsers": [{"demographic": "目标用户群体描述", "likelihood": "高/中/低"}],
  "successProbability": "高/中/低",
  "summary": "简短的一句话分析",
  "marketInsights": "市场洞察和建议",
  "userPersonas": ["用户画像1", "用户画像2", "用户画像3"]
}

请用中文分析，但保持产品名称为英文。重点关注最可能的目标用户群体。`;
  }

  // Analyze a single product with ChatGPT
  async analyzeProduct(product, retryCount = 0) {
    try {
      if (!this.openai) {
        console.log(`Using fallback analysis for: ${product.name}`);
        return this.createFallbackAnalysis(product);
      }

      console.log(`Analyzing product: ${product.name} (attempt ${retryCount + 1})`);

      const prompt = this.createAnalysisPrompt(product);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Use mini version for cost efficiency
        messages: [
          {
            role: "system",
            content: "You are a market analyst. Provide concise JSON analysis of products and their target users."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 300, // Reduced tokens for cost efficiency
        response_format: { type: "json_object" }
      });

      const analysisText = completion.choices[0].message.content;
      
      // Parse the JSON response
      let analysis;
      try {
        analysis = JSON.parse(analysisText);
      } catch (parseError) {
        console.error('Failed to parse ChatGPT response as JSON:', parseError);
        // Fallback: return the raw text if JSON parsing fails
        analysis = {
          error: 'Failed to parse structured response',
          rawResponse: analysisText,
          summary: 'Analysis completed but response format was invalid'
        };
      }

      // Add metadata
      analysis.metadata = {
        analyzedAt: new Date().toISOString(),
        model: this.model,
        tokensUsed: completion.usage?.total_tokens || 0,
        productId: product.id,
        productName: product.name
      };

      console.log(`Successfully analyzed product: ${product.name}`);
      return analysis;

    } catch (error) {
      console.error(`Error analyzing product ${product.name} (attempt ${retryCount + 1}):`, error.message);
      
      // Retry logic for rate limits and temporary errors
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        console.log(`Retrying analysis for ${product.name} in ${this.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.analyzeProduct(product, retryCount + 1);
      }
      
      // Return simplified error analysis if all retries failed
      return {
        error: error.message,
        targetUsers: [{ demographic: "Analysis failed", likelihood: "unknown" }],
        successProbability: "unknown",
        summary: "Analysis unavailable due to API error",
        analyzedAt: new Date().toISOString()
      };
    }
  }

  // Determine if we should retry the request
  shouldRetry(error) {
    // Retry on rate limits and temporary server errors
    if (error.status === 429) return true; // Rate limit
    if (error.status >= 500 && error.status < 600) return true; // Server errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true; // Network errors

    return false;
  }

  // Fallback analysis when ChatGPT is unavailable (Chinese version)
  createFallbackAnalysis(product) {
    // Simple rule-based analysis based on product data
    const voteCount = product.votesCount || 0;
    const topics = product.topics?.map(t => t.name) || [];

    let targetUsers = [];
    let successProbability = '中';

    // Basic categorization based on topics and votes (Chinese)
    if (topics.some(t => t.toLowerCase().includes('developer') || t.toLowerCase().includes('tech'))) {
      targetUsers.push({ demographic: "开发者和技术专业人士", likelihood: "高" });
    }
    if (topics.some(t => t.toLowerCase().includes('business') || t.toLowerCase().includes('productivity'))) {
      targetUsers.push({ demographic: "商业专业人士", likelihood: "高" });
    }
    if (topics.some(t => t.toLowerCase().includes('design') || t.toLowerCase().includes('creative'))) {
      targetUsers.push({ demographic: "设计师和创意工作者", likelihood: "高" });
    }
    if (topics.some(t => t.toLowerCase().includes('ai') || t.toLowerCase().includes('machine learning'))) {
      targetUsers.push({ demographic: "AI和机器学习从业者", likelihood: "高" });
    }
    if (topics.some(t => t.toLowerCase().includes('marketing') || t.toLowerCase().includes('social'))) {
      targetUsers.push({ demographic: "营销和社交媒体专家", likelihood: "高" });
    }

    // Default if no specific category found
    if (targetUsers.length === 0) {
      targetUsers.push({ demographic: "一般科技用户", likelihood: "中" });
    }

    // Success probability based on vote count
    if (voteCount > 100) successProbability = '高';
    else if (voteCount < 20) successProbability = '低';

    return {
      productName: product.name,
      targetUsers,
      successProbability,
      summary: `获得${voteCount}票的产品，主要面向${targetUsers[0].demographic}`,
      marketInsights: "基于产品类别和投票数的基础分析",
      userPersonas: targetUsers.slice(0, 3).map(user => user.demographic),
      fallback: true,
      analyzedAt: new Date().toISOString()
    };
  }

  // Analyze multiple products in batch
  async analyzeProductsBatch(products, batchSize = 5, delayBetweenBatches = 5000) {
    const results = [];
    
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(products.length / batchSize)}`);
      
      const batchPromises = batch.map(product => this.analyzeProduct(product));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`Failed to analyze product ${batch[index].name}:`, result.reason);
          results.push({
            error: result.reason.message,
            productId: batch[index].id,
            productName: batch[index].name,
            analyzedAt: new Date().toISOString()
          });
        }
      });
      
      // Delay between batches to respect rate limits
      if (i + batchSize < products.length) {
        console.log(`Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    return results;
  }

  // Generate market summary from multiple product analyses
  async generateMarketSummary(analyzedProducts) {
    try {
      const summaryPrompt = `
Based on the following product analyses, generate a comprehensive market summary:

${analyzedProducts.map((product, index) => `
Product ${index + 1}: ${product.productName || 'Unknown'}
Analysis Summary: ${product.summary || 'No summary available'}
Target Users: ${product.targetUsers?.map(u => u.demographic).join(', ') || 'Not specified'}
Success Probability: ${product.successProbability || 'Unknown'}
`).join('\n')}

Please provide a market summary in JSON format:
{
  "overallTrends": ["trend 1", "trend 2"],
  "emergingOpportunities": ["opportunity 1", "opportunity 2"],
  "commonTargetDemographics": ["demographic 1", "demographic 2"],
  "marketInsights": "Overall market analysis",
  "recommendations": ["recommendation 1", "recommendation 2"],
  "summary": "Executive summary of the market analysis"
}
`;

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a senior market research analyst. Synthesize multiple product analyses into comprehensive market insights."
          },
          {
            role: "user",
            content: summaryPrompt
          }
        ],
        temperature: 0.6,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error('Error generating market summary:', error);
      return {
        error: error.message,
        summary: 'Failed to generate market summary'
      };
    }
  }
}

module.exports = new ChatGPTService();
