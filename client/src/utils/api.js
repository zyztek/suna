
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://0.0.0.0:5000/api';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export const apiCall = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.error || `HTTP Error: ${response.status}`,
        response.status,
        errorData
      );
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Network or other errors
    throw new ApiError(
      error.message || 'Network error occurred',
      0,
      null
    );
  }
};

// Authenticated API call helper
export const authenticatedApiCall = (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    throw new ApiError('No authentication token found', 401, null);
  }

  return apiCall(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
};

// Specific API functions
export const authApi = {
  login: (email, password) =>
    apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
    
  register: (name, email, password) =>
    apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    }),
    
  getProfile: () =>
    authenticatedApiCall('/auth/me'),
    
  updateProfile: (data) =>
    authenticatedApiCall('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
};

export const knowledgeBaseApi = {
  getArticles: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiCall(`/knowledge-base${queryString ? `?${queryString}` : ''}`);
  },
  
  getArticle: (id) =>
    apiCall(`/knowledge-base/${id}`),
    
  createArticle: (data) =>
    authenticatedApiCall('/knowledge-base', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    
  updateArticle: (id, data) =>
    authenticatedApiCall(`/knowledge-base/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    
  deleteArticle: (id) =>
    authenticatedApiCall(`/knowledge-base/${id}`, {
      method: 'DELETE'
    }),
    
  likeArticle: (id) =>
    authenticatedApiCall(`/knowledge-base/${id}/like`, {
      method: 'POST'
    }),
    
  addComment: (id, content) =>
    authenticatedApiCall(`/knowledge-base/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    }),
    
  getMyArticles: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return authenticatedApiCall(`/knowledge-base/my/articles${queryString ? `?${queryString}` : ''}`);
  }
};

export const recommendationsApi = {
  getRecommendations: () =>
    authenticatedApiCall('/recommendations'),
    
  getTrending: (limit = 10) =>
    apiCall(`/recommendations/trending?limit=${limit}`),
    
  getByCategory: (category, options = {}) => {
    const queryString = new URLSearchParams(options).toString();
    return apiCall(`/recommendations/by-category/${category}${queryString ? `?${queryString}` : ''}`);
  },
    
  getSimilar: (id, limit = 5) =>
    apiCall(`/recommendations/similar/${id}?limit=${limit}`)
};
