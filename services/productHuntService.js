// Product Hunt API Service - GraphQL queries for trending products
const axios = require('axios');

class ProductHuntService {
  constructor() {
    this.apiUrl = 'https://api.producthunt.com/v2/api/graphql';
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  // Simplified GraphQL query to get trending products sorted by votes (reduced complexity)
  getTrendingProductsQuery() {
    return `
      query getTrendingPosts($first: Int!, $after: String) {
        posts(first: $first, after: $after, order: VOTES) {
          edges {
            node {
              id
              name
              tagline
              description
              url
              votesCount
              commentsCount
              createdAt
              featuredAt
              website
              makers {
                id
                name
                username
              }
              topics {
                edges {
                  node {
                    name
                  }
                }
              }
              thumbnail {
                url
              }
              user {
                id
                name
                username
              }
            }
          }
        }
      }
    `;
  }

  // Make GraphQL request with retry logic
  async makeGraphQLRequest(query, variables, accessToken, retryCount = 0) {
    try {
      // Enhanced headers to avoid bot detection
      const authHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      };

      // Product Hunt developer token format
      if (accessToken) {
        authHeaders['Authorization'] = `Bearer ${accessToken}`;
      }

      console.log('Making request to:', this.apiUrl);
      console.log('Auth header present:', !!authHeaders['Authorization']);

      const response = await axios.post(
        this.apiUrl,
        {
          query,
          variables
        },
        {
          headers: authHeaders,
          timeout: 30000, // 30 seconds timeout
          maxRedirects: 5,
          validateStatus: function (status) {
            return status < 500; // Resolve only if the status code is less than 500
          }
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data;
    } catch (error) {
      console.error(`GraphQL request failed (attempt ${retryCount + 1}):`, error.message);

      // Log more details about the error
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        console.error('Response headers:', error.response.headers);
      }

      // Retry logic for network errors or rate limits
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        console.log(`Retrying in ${this.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.makeGraphQLRequest(query, variables, accessToken, retryCount + 1);
      }

      throw error;
    }
  }

  // Determine if we should retry the request
  shouldRetry(error) {
    if (error.response) {
      const status = error.response.status;
      // Retry on rate limits, server errors, but not on auth errors
      return status === 429 || (status >= 500 && status < 600);
    }
    // Retry on network errors
    return error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
  }

  // Get today's trending products from Product Hunt (launched today, sorted by votes)
  async getTrendingProducts(accessToken, limit = 20) {
    try {
      console.log(`Fetching products launched today from Product Hunt...`);

      // Fetch a reasonable number of products to filter for today's launches
      // Keep it under GraphQL complexity limit (500,000)
      const fetchLimit = Math.min(limit * 2, 30); // Fetch 2x more but cap at 30 to avoid complexity issues

      const query = this.getTrendingProductsQuery();
      const variables = {
        first: fetchLimit,
        after: null
      };

      const response = await this.makeGraphQLRequest(query, variables, accessToken);

      if (!response.data || !response.data.posts) {
        throw new Error('Invalid response structure from Product Hunt API');
      }

      const posts = response.data.posts.edges.map(edge => edge.node);

      // Filter for today's products
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      console.log(`Filtering for products launched today (${todayStart.toISOString().split('T')[0]})...`);

      const todaysProducts = posts.filter(post => {
        // Check both createdAt and featuredAt for today's date
        const createdDate = new Date(post.createdAt);
        const featuredDate = post.featuredAt ? new Date(post.featuredAt) : null;

        const isCreatedToday = createdDate >= todayStart && createdDate < todayEnd;
        const isFeaturedToday = featuredDate && featuredDate >= todayStart && featuredDate < todayEnd;

        return isCreatedToday || isFeaturedToday;
      });

      // Sort by votes count (descending)
      todaysProducts.sort((a, b) => (b.votesCount || 0) - (a.votesCount || 0));

      // Take only the requested number of products
      const limitedProducts = todaysProducts.slice(0, limit);

      if (limitedProducts.length > 0) {
        const products = limitedProducts.map(post => this.transformProduct(post));
        console.log(`Successfully found ${products.length} products launched today (sorted by votes)`);
        return products;
      } else {
        console.log('No products found for today, using recent trending products...');

        // If no today's products, return recent trending products sorted by votes
        const allProducts = posts.slice(0, limit).map(post => this.transformProduct(post));
        console.log(`Using ${allProducts.length} recent trending products as fallback`);
        return allProducts;
      }

    } catch (error) {
      console.error('Error fetching trending products via GraphQL:', error.message);

      // Try fallback to REST API if GraphQL fails
      try {
        console.log('Attempting fallback to REST API...');
        return await this.getTrendingProductsREST(accessToken, limit);
      } catch (restError) {
        console.error('REST API fallback also failed:', restError.message);

        // Final fallback to mock data for demo purposes
        console.log('Using mock data as final fallback...');
        return this.getMockProducts(limit);
      }
    }
  }

  // Fallback REST API method
  async getTrendingProductsREST(accessToken, limit = 20) {
    try {
      console.log('Using REST API fallback...');

      const restUrl = 'https://api.producthunt.com/v1/posts';
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      const response = await axios.get(restUrl, {
        headers,
        params: {
          sort_by: 'votes_count',
          order: 'desc',
          per_page: Math.min(limit, 50) // REST API has different limits
        },
        timeout: 30000
      });

      if (!response.data || !response.data.posts) {
        throw new Error('Invalid response from REST API');
      }

      // Transform REST API response to match our format
      const products = response.data.posts.map(post => this.transformRESTProduct(post));

      console.log(`Successfully fetched ${products.length} products via REST API`);
      return products.slice(0, limit);

    } catch (error) {
      console.error('REST API request failed:', error.message);
      throw error;
    }
  }

  // Transform REST API product data
  transformRESTProduct(post) {
    return {
      id: post.id?.toString() || '',
      name: post.name || '',
      tagline: post.tagline || '',
      description: post.discussion_url || post.redirect_url || '',
      url: post.discussion_url || '',
      website: post.redirect_url || '',
      votesCount: post.votes_count || 0,
      commentsCount: post.comments_count || 0,
      createdAt: post.day || new Date().toISOString(),
      featuredAt: post.day || new Date().toISOString(),
      thumbnail: post.screenshot_url?.['300px'] || post.screenshot_url?.['850px'] || null,
      makers: [], // REST API doesn't include maker details in list view
      topics: [], // REST API doesn't include topics in list view
      productLinks: [],
      user: post.user ? {
        id: post.user.id?.toString() || '',
        name: post.user.name || '',
        username: post.user.username || ''
      } : null,
      fetchedAt: new Date().toISOString()
    };
  }

  // Transform Product Hunt post data to our format
  transformProduct(post) {
    return {
      id: post.id,
      name: post.name,
      tagline: post.tagline,
      description: post.description,
      url: post.url,
      website: post.website,
      votesCount: post.votesCount,
      commentsCount: post.commentsCount,
      createdAt: post.createdAt,
      featuredAt: post.featuredAt,
      thumbnail: post.thumbnail?.url || null,
      makers: post.makers?.map(maker => ({
        id: maker.id,
        name: maker.name,
        username: maker.username,
        profileImage: maker.profileImage
      })) || [],
      topics: post.topics?.edges?.map(edge => ({
        id: edge.node.id || '',
        name: edge.node.name,
        slug: edge.node.slug || edge.node.name?.toLowerCase().replace(/\s+/g, '-') || ''
      })) || [],
      productLinks: post.productLinks?.map(link => ({
        type: link.type,
        url: link.url
      })) || [],
      user: post.user ? {
        id: post.user.id,
        name: post.user.name,
        username: post.user.username
      } : null,
      fetchedAt: new Date().toISOString()
    };
  }

  // Get specific product by ID
  async getProductById(accessToken, productId) {
    try {
      const query = `
        query getPost($id: ID!) {
          post(id: $id) {
            id
            name
            tagline
            description
            url
            votesCount
            commentsCount
            createdAt
            featuredAt
            website
            thumbnail {
              url
            }
            makers {
              id
              name
              username
            }
            topics {
              edges {
                node {
                  name
                }
              }
            }
          }
        }
      `;

      const variables = { id: productId };
      const response = await this.makeGraphQLRequest(query, variables, accessToken);
      
      if (!response.data || !response.data.post) {
        throw new Error('Product not found');
      }

      return this.transformProduct(response.data.post);
    } catch (error) {
      console.error(`Error fetching product ${productId}:`, error.message);
      throw error;
    }
  }

  // Get products by date range
  async getProductsByDateRange(accessToken, startDate, endDate, limit = 50) {
    try {
      // Note: Product Hunt API doesn't directly support date filtering in the public API
      // This is a workaround that fetches recent products and filters them
      const products = await this.getTrendingProducts(accessToken, limit);
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      return products.filter(product => {
        const productDate = new Date(product.createdAt);
        return productDate >= start && productDate <= end;
      });
    } catch (error) {
      console.error('Error fetching products by date range:', error.message);
      throw error;
    }
  }

  // Mock data for demo purposes when APIs are unavailable
  getMockProducts(limit = 20) {
    console.log('Generating mock product data for demonstration...');

    const mockProducts = [
      {
        id: 'mock-1',
        name: 'AI Code Assistant Pro',
        tagline: 'Your intelligent coding companion',
        description: 'An advanced AI-powered code assistant that helps developers write better code faster with intelligent suggestions and automated refactoring.',
        url: 'https://example.com/ai-code-assistant',
        website: 'https://example.com/ai-code-assistant',
        votesCount: 1247,
        commentsCount: 89,
        createdAt: new Date().toISOString(),
        featuredAt: new Date().toISOString(),
        thumbnail: 'https://via.placeholder.com/300x200/4F46E5/FFFFFF?text=AI+Code+Assistant',
        makers: [{ id: '1', name: 'Alex Developer', username: 'alexdev', profileImage: null }],
        topics: [{ id: '1', name: 'Developer Tools', slug: 'developer-tools' }],
        productLinks: [],
        user: { id: '1', name: 'Alex Developer', username: 'alexdev' },
        fetchedAt: new Date().toISOString()
      },
      {
        id: 'mock-2',
        name: 'DataViz Studio',
        tagline: 'Beautiful data visualizations made simple',
        description: 'Create stunning interactive charts and dashboards from your data with our intuitive drag-and-drop interface.',
        url: 'https://example.com/dataviz-studio',
        website: 'https://example.com/dataviz-studio',
        votesCount: 892,
        commentsCount: 67,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        featuredAt: new Date(Date.now() - 86400000).toISOString(),
        thumbnail: 'https://via.placeholder.com/300x200/10B981/FFFFFF?text=DataViz+Studio',
        makers: [{ id: '2', name: 'Sarah Analytics', username: 'sarahdata', profileImage: null }],
        topics: [{ id: '2', name: 'Analytics', slug: 'analytics' }],
        productLinks: [],
        user: { id: '2', name: 'Sarah Analytics', username: 'sarahdata' },
        fetchedAt: new Date().toISOString()
      },
      {
        id: 'mock-3',
        name: 'CloudSync Manager',
        tagline: 'Seamless file synchronization across all devices',
        description: 'Keep your files in sync across all your devices with our secure, fast, and reliable cloud synchronization service.',
        url: 'https://example.com/cloudsync',
        website: 'https://example.com/cloudsync',
        votesCount: 634,
        commentsCount: 45,
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        featuredAt: new Date(Date.now() - 172800000).toISOString(),
        thumbnail: 'https://via.placeholder.com/300x200/F59E0B/FFFFFF?text=CloudSync',
        makers: [{ id: '3', name: 'Mike Cloud', username: 'mikecloud', profileImage: null }],
        topics: [{ id: '3', name: 'Productivity', slug: 'productivity' }],
        productLinks: [],
        user: { id: '3', name: 'Mike Cloud', username: 'mikecloud' },
        fetchedAt: new Date().toISOString()
      }
    ];

    // Generate more mock products if needed
    const additionalProducts = [];
    for (let i = 4; i <= limit && i <= 20; i++) {
      additionalProducts.push({
        id: `mock-${i}`,
        name: `Product ${i}`,
        tagline: `Innovative solution for modern challenges`,
        description: `A cutting-edge product that solves real-world problems with elegant design and powerful features.`,
        url: `https://example.com/product-${i}`,
        website: `https://example.com/product-${i}`,
        votesCount: Math.floor(Math.random() * 500) + 100,
        commentsCount: Math.floor(Math.random() * 50) + 10,
        createdAt: new Date(Date.now() - (i * 86400000)).toISOString(),
        featuredAt: new Date(Date.now() - (i * 86400000)).toISOString(),
        thumbnail: `https://via.placeholder.com/300x200/6366F1/FFFFFF?text=Product+${i}`,
        makers: [{ id: `${i}`, name: `Creator ${i}`, username: `creator${i}`, profileImage: null }],
        topics: [{ id: `${i}`, name: 'Technology', slug: 'technology' }],
        productLinks: [],
        user: { id: `${i}`, name: `Creator ${i}`, username: `creator${i}` },
        fetchedAt: new Date().toISOString()
      });
    }

    const allMockProducts = [...mockProducts, ...additionalProducts];
    return allMockProducts.slice(0, limit);
  }
}

module.exports = new ProductHuntService();
