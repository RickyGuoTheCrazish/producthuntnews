// Product Hunt API Service - GraphQL queries for trending products
const axios = require('axios');

class ProductHuntService {
  constructor() {
    this.apiUrl = 'https://api.producthunt.com/v2/api/graphql';
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  // GraphQL query to get trending products
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
              productLinks {
                type
                url
              }
              makers {
                id
                name
                username
                profileImage
              }
              topics {
                edges {
                  node {
                    id
                    name
                    slug
                  }
                }
              }
              thumbnail {
                type
                url
              }
              gallery {
                images {
                  url
                }
              }
              user {
                id
                name
                username
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;
  }

  // Make GraphQL request with retry logic
  async makeGraphQLRequest(query, variables, accessToken, retryCount = 0) {
    try {
      // Try different auth header formats for Product Hunt API
      const authHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
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
          timeout: 30000 // 30 seconds timeout
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

  // Get trending products from Product Hunt
  async getTrendingProducts(accessToken, limit = 20) {
    try {
      console.log(`Fetching ${limit} trending products from Product Hunt...`);
      
      const query = this.getTrendingProductsQuery();
      const variables = {
        first: limit,
        after: null
      };

      const response = await this.makeGraphQLRequest(query, variables, accessToken);
      
      if (!response.data || !response.data.posts) {
        throw new Error('Invalid response structure from Product Hunt API');
      }

      const posts = response.data.posts.edges.map(edge => edge.node);
      
      // Transform the data to a more usable format
      const products = posts.map(post => this.transformProduct(post));
      
      console.log(`Successfully fetched ${products.length} trending products`);
      return products;
      
    } catch (error) {
      console.error('Error fetching trending products:', error.message);
      throw new Error(`Failed to fetch trending products: ${error.message}`);
    }
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
      gallery: post.gallery?.images?.map(img => img.url) || [],
      makers: post.makers?.map(maker => ({
        id: maker.id,
        name: maker.name,
        username: maker.username,
        profileImage: maker.profileImage
      })) || [],
      topics: post.topics?.edges?.map(edge => ({
        id: edge.node.id,
        name: edge.node.name,
        slug: edge.node.slug
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
}

module.exports = new ProductHuntService();
