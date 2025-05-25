const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

// Configure axios defaults for better connectivity on Raspberry Pi
axios.defaults.timeout = 30000; // 30 seconds timeout
axios.defaults.family = 4; // Force IPv4

class WordPressService {
  constructor() {
    this.wpUrl = process.env.WP_URL;
    this.username = process.env.WP_USERNAME;
    this.password = process.env.WP_APPLICATION_PASSWORD;
    this.apiBase = `${this.wpUrl}/wp-json/wp/v2`;
    this.categories = {
      travel: null,
      food: null,
      accommodation: null,
      attractions: null
    };
    this.authorId = null;
    this.initialized = false;
  }

  // Get basic authorization headers
  getAuthHeaders() {
    return {
      'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
      'Content-Type': 'application/json'
    };
  }

  // Initialize and check connection
  async initialize() {
    try {
      if (this.initialized) return true;
      
      // Check connection
      const response = await axios.get(`${this.wpUrl}/wp-json`, {
        headers: this.getAuthHeaders()
      });
      
      console.log(`Connected to WordPress site: ${response.data.name}`);

      // Check/create categories
      await this.ensureCategories();
      
      // Get author ID if set
      if (process.env.AUTHOR_NAME) {
        try {
          const users = await axios.get(`${this.apiBase}/users`, {
            headers: this.getAuthHeaders(),
            params: {
              search: process.env.AUTHOR_NAME
            }
          });
          
          if (users.data && users.data.length > 0) {
            this.authorId = users.data[0].id;
            console.log(`Found author ID for ${process.env.AUTHOR_NAME}: ${this.authorId}`);
          }
        } catch (error) {
          console.warn(`Could not find author "${process.env.AUTHOR_NAME}": ${error.message}`);
        }
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error(`WordPress API initialization error: ${error.message}`);
      if (error.response) {
        console.error('API error details:', error.response.data);
      }
      return false;
    }
  }

  // Create or get required categories
  async ensureCategories() {
    try {
      // Find or create main blog category
      let mainCategory;
      try {
        const existingCategories = await axios.get(`${this.apiBase}/categories`, {
          headers: this.getAuthHeaders(),
          params: {
            search: 'Giovanni\'s Travel Blog'
          }
        });
        
        if (existingCategories.data && existingCategories.data.length > 0) {
          mainCategory = existingCategories.data[0];
        } else {
          const newCategory = await axios.post(`${this.apiBase}/categories`, {
            name: 'Giovanni\'s Travel Blog',
            description: 'Posts from Giovanni\'s European journey'
          }, {
            headers: this.getAuthHeaders()
          });
          
          mainCategory = newCategory.data;
        }
      } catch (err) {
        console.error(`Error with main category: ${err.message}`);
        // Create category if previous request failed
        const newCategory = await axios.post(`${this.apiBase}/categories`, {
          name: 'Giovanni\'s Travel Blog',
          description: 'Posts from Giovanni\'s European journey'
        }, {
          headers: this.getAuthHeaders()
        });
        
        mainCategory = newCategory.data;
      }

      // Function for creating subcategories
      const createSubCategory = async (name, description) => {
        try {
          // Check for existing category
          const existingCategories = await axios.get(`${this.apiBase}/categories`, {
            headers: this.getAuthHeaders(),
            params: { search: name }
          });
          
          if (existingCategories.data && existingCategories.data.length > 0) {
            // Find the category with the correct parent
            const foundCategory = existingCategories.data.find(cat => 
              cat.name === name && cat.parent === mainCategory.id
            );
            
            if (foundCategory) {
              console.log(`Using existing category: ${name}`);
              return foundCategory;
            }
          }
          
          // Create new category if not found
          const newCategory = await axios.post(`${this.apiBase}/categories`, {
            name,
            description,
            parent: mainCategory.id
          }, {
            headers: this.getAuthHeaders()
          });
          
          return newCategory.data;
        } catch (err) {
          // Handle term_exists error gracefully
          if (err.response && err.response.data && err.response.data.code === 'term_exists') {
            console.log(`Category ${name} already exists, retrieving existing one`);
            const existingId = err.response.data.data.term_id;
            try {
              const existingCategory = await axios.get(`${this.apiBase}/categories/${existingId}`, {
                headers: this.getAuthHeaders()
              });
              return existingCategory.data;
            } catch (getErr) {
              console.error(`Error retrieving existing category: ${getErr.message}`);
              // Return a minimal object that has the id
              return { id: existingId, name: name };
            }
          }
          
          console.error(`Error creating subcategory ${name}: ${err.message}`);
          throw err;
        }
      };

      // Create subcategories
      this.categories.travel = await createSubCategory(
        'Travel Adventures',
        'Giovanni\'s journeys between locations'
      );
      
      this.categories.food = await createSubCategory(
        'Local Cuisine',
        'Food experiences during Giovanni\'s travels'
      );
      
      this.categories.accommodation = await createSubCategory(
        'Accommodations',
        'Places where Giovanni stayed during his travels'
      );
      
      this.categories.attractions = await createSubCategory(
        'Attractions & Sights',
        'Interesting places Giovanni visited'
      );
      
      console.log('Categories successfully created/fetched');
      return true;
    } catch (error) {
      console.error(`Error ensuring categories: ${error.message}`);
      if (error.response) {
        console.error('API error details:', error.response.data);
      }
      return false;
    }
  }

  // Upload media to WordPress
  async uploadMedia(imagePath, title, caption = '', alt = '') {
    try {
      if (!this.initialized) await this.initialize();
      
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      
      // Determine file type
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      
      const ext = path.extname(imagePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'image/jpeg';
      
      // Read image file
      const imageData = fs.readFileSync(imagePath);
      const filename = path.basename(imagePath);
      
      // Prepare form for upload
      const formData = new FormData();
      formData.append('file', imageData, {
        filename: filename,
        contentType: contentType
      });
      
      // Upload image
      const response = await axios.post(`${this.apiBase}/media`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`
        }
      });
      
      // Update image metadata
      await axios.post(`${this.apiBase}/media/${response.data.id}`, {
        title: title,
        caption: caption,
        alt_text: alt,
        description: `${caption} | Photo for Giovanni's Travel Blog`
      }, {
        headers: this.getAuthHeaders()
      });
      
      console.log(`Media uploaded successfully: ${response.data.source_url}`);
      return response.data;
    } catch (error) {
      console.error(`Error uploading media: ${error.message}`);
      if (error.response) {
        console.error('API error details:', error.response.data);
      }
      throw error;
    }
  }

  // Create post
  async createPost(postData) {
    try {
      if (!this.initialized) await this.initialize();
      
      // Prepare post data
      const postContent = {
        title: postData.title,
        content: postData.content,
        excerpt: postData.excerpt || '',
        status: postData.status || 'publish',
        categories: postData.categories || [this.categories.travel.id]
      };
      
      // Add author if available
      if (this.authorId) {
        postContent.author = this.authorId;
      }
      
      // Add publish date if specified
      if (postData.publishDate) {
        postContent.date = new Date(postData.publishDate).toISOString();
      }
      
      // Add tags
      if (postData.tags && postData.tags.length > 0) {
        // Check existing tags and create new ones if needed
        const tagIds = [];
        
        for (const tagName of postData.tags) {
          let tag;
          
          try {
            // Find existing tag
            const existingTags = await axios.get(`${this.apiBase}/tags`, {
              headers: this.getAuthHeaders(),
              params: {
                search: tagName
              }
            });
            
            if (existingTags.data && existingTags.data.length > 0) {
              tag = existingTags.data[0];
            } else {
              // Create new tag
              const newTag = await axios.post(`${this.apiBase}/tags`, {
                name: tagName
              }, {
                headers: this.getAuthHeaders()
              });
              
              tag = newTag.data;
            }
            
            tagIds.push(tag.id);
          } catch (error) {
            console.warn(`Error processing tag ${tagName}: ${error.message}`);
          }
        }
        
        if (tagIds.length > 0) {
          postContent.tags = tagIds;
        }
      }
      
      // Create post
      const post = await axios.post(`${this.apiBase}/posts`, postContent, {
        headers: this.getAuthHeaders()
      });
      
      // If featured image provided, set it
      if (postData.featuredImagePath) {
        try {
          const media = await this.uploadMedia(
            postData.featuredImagePath,
            `Featured image for ${postData.title}`,
            postData.imageCaption || '',
            postData.imageAlt || postData.title
          );
          
          // Set featured image
          await axios.post(`${this.apiBase}/posts/${post.data.id}`, {
            featured_media: media.id
          }, {
            headers: this.getAuthHeaders()
          });
          
          // Update post data
          post.data.featured_media = media.id;
          post.data.featured_media_url = media.source_url;
        } catch (mediaError) {
          console.error(`Error setting featured image: ${mediaError.message}`);
        }
      }
      
      console.log(`Post created successfully: ${post.data.link}`);
      return post.data;
    } catch (error) {
      console.error(`Error creating post: ${error.message}`);
      if (error.response) {
        console.error('API error details:', error.response.data);
      }
      throw error;
    }
  }

  // Update existing post
  async updatePost(postId, postData) {
    try {
      if (!this.initialized) await this.initialize();
      
      // Prepare update data
      const updateData = {};
      if (postData.title) updateData.title = postData.title;
      if (postData.content) updateData.content = postData.content;
      if (postData.excerpt) updateData.excerpt = postData.excerpt;
      if (postData.status) updateData.status = postData.status;
      
      // If new image provided, upload it
      if (postData.featuredImagePath) {
        try {
          const media = await this.uploadMedia(
            postData.featuredImagePath,
            `Featured image for ${postData.title || 'post update'}`,
            postData.imageCaption || '',
            postData.imageAlt || postData.title || 'Post image'
          );
          
          updateData.featured_media = media.id;
        } catch (mediaError) {
          console.error(`Error updating featured image: ${mediaError.message}`);
        }
      }
      
      // Update post
      const updatedPost = await axios.post(`${this.apiBase}/posts/${postId}`, updateData, {
        headers: this.getAuthHeaders()
      });
      
      console.log(`Post updated successfully: ${updatedPost.data.link}`);
      return updatedPost.data;
    } catch (error) {
      console.error(`Error updating post: ${error.message}`);
      if (error.response) {
        console.error('API error details:', error.response.data);
      }
      throw error;
    }
  }

  // Get post by ID
  async getPost(postId) {
    try {
      if (!this.initialized) await this.initialize();
      
      const response = await axios.get(`${this.apiBase}/posts/${postId}`, {
        headers: this.getAuthHeaders()
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error getting post: ${error.message}`);
      return null;
    }
  }

  // Create complete travel post with images
  async createTravelPost(postData) {
    try {
      if (!this.initialized) await this.initialize();
      
      // 1. Upload all images
      const uploadedImages = [];
      
      // Upload featured image
      let featuredImage = null;
      if (postData.featuredImagePath) {
        featuredImage = await this.uploadMedia(
          postData.featuredImagePath,
          `Featured image: ${postData.title}`,
          postData.featuredImageCaption || '',
          postData.featuredImageAlt || postData.title
        );
      }
      
      // Upload other images
      if (postData.images && postData.images.length > 0) {
        for (const image of postData.images) {
          try {
            const uploadedImage = await this.uploadMedia(
              image.path,
              image.title || `Image for ${postData.title}`,
              image.caption || '',
              image.alt || image.caption || `Image for ${postData.title}`
            );
            
            uploadedImages.push({
              ...uploadedImage,
              original: image
            });
          } catch (imageError) {
            console.error(`Error uploading image ${image.path}: ${imageError.message}`);
          }
        }
      }
      
      // 2. Prepare content with embedded images
      let content = postData.content;
      
      // Replace image placeholders with image URLs
      if (uploadedImages.length > 0) {
        for (let i = 0; i < uploadedImages.length; i++) {
          const placeholderToReplace = `IMAGE_PLACEHOLDER_${i + 1}`;
          content = content.replace(placeholderToReplace, uploadedImages[i].source_url);
        }
      }
      
      // For featured image (only if IMAGE_PLACEHOLDER exists in content)
      if (featuredImage && content.includes('IMAGE_PLACEHOLDER')) {
        content = content.replace('IMAGE_PLACEHOLDER', featuredImage.source_url);
      }
      
      // 3. Determine categories
      const categories = [];
      
      // Main blog category always added
      categories.push(this.categories.travel.id);
      
      // Add specific categories
      if (postData.categories) {
        for (const category of postData.categories) {
          if (this.categories[category]) {
            categories.push(this.categories[category].id);
          }
        }
      }
      
      // 4. Create tags
      let tagIds = [];
      if (postData.tags && postData.tags.length > 0) {
        for (const tagName of postData.tags) {
          try {
            // Find existing tag
            const existingTags = await axios.get(`${this.apiBase}/tags`, {
              headers: this.getAuthHeaders(),
              params: { search: tagName }
            });
            
            if (existingTags.data && existingTags.data.length > 0) {
              tagIds.push(existingTags.data[0].id);
            } else {
              // Create new tag
              const newTag = await axios.post(`${this.apiBase}/tags`, { name: tagName }, {
                headers: this.getAuthHeaders()
              });
              
              tagIds.push(newTag.data.id);
            }
          } catch (error) {
            console.warn(`Error processing tag ${tagName}: ${error.message}`);
          }
        }
      }
      
      // 5. Create post
      const postContent = {
        title: postData.title,
        content: content,
        excerpt: postData.excerpt || '',
        status: postData.status || 'publish',
        categories: categories,
        tags: tagIds,
      };
      
      // Add author if available
      if (this.authorId) {
        postContent.author = this.authorId;
      }
      
      // Add publish date if specified
      if (postData.publishDate) {
        postContent.date = new Date(postData.publishDate).toISOString();
      }
      
      // Add featured image if available
      if (featuredImage) {
        postContent.featured_media = featuredImage.id;
      }
      
      const post = await axios.post(`${this.apiBase}/posts`, postContent, {
        headers: this.getAuthHeaders()
      });
      
      console.log(`Travel post created successfully: ${post.data.link}`);
      
      // 6. Return result with uploaded media info
      return {
        post: post.data,
        featuredImage,
        uploadedImages
      };
    } catch (error) {
      console.error(`Error creating travel post: ${error.message}`);
      if (error.response) {
        console.error('API error details:', error.response.data);
      }
      throw error;
    }
  }
}

module.exports = new WordPressService();
