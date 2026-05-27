/**
 * Sijang - GitHub Service
 */

const axios = require('axios')

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_API = 'https://api.github.com'
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'Vibeaman'

const headers = {
  'Authorization': `token ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Sijang-Bot'
}

// List user repos
async function listRepos(limit = 10) {
  try {
    const response = await axios.get(`${GITHUB_API}/user/repos`, {
      headers,
      params: {
        sort: 'updated',
        per_page: limit
      }
    })
    return response.data.map(r => ({
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      url: r.html_url,
      private: r.private,
      updatedAt: r.updated_at
    }))
  } catch (error) {
    console.error('GitHub listRepos error:', error.response?.data?.message || error.message)
    throw new Error(error.response?.data?.message || 'Failed to list repos')
  }
}

// Create a new repo
async function createRepo(name, description = '', isPrivate = false) {
  try {
    const response = await axios.post(`${GITHUB_API}/user/repos`, {
      name,
      description,
      private: isPrivate,
      auto_init: true
    }, { headers })
    
    return {
      name: response.data.name,
      fullName: response.data.full_name,
      url: response.data.html_url,
      cloneUrl: response.data.clone_url
    }
  } catch (error) {
    console.error('GitHub createRepo error:', error.response?.data?.message || error.message)
    throw new Error(error.response?.data?.message || 'Failed to create repo')
  }
}

// Create a gist
async function createGist(description, filename, content, isPublic = true) {
  try {
    const response = await axios.post(`${GITHUB_API}/gists`, {
      description,
      public: isPublic,
      files: {
        [filename]: { content }
      }
    }, { headers })
    
    return {
      id: response.data.id,
      url: response.data.html_url,
      rawUrl: response.data.files[filename]?.raw_url
    }
  } catch (error) {
    console.error('GitHub createGist error:', error.response?.data?.message || error.message)
    throw new Error(error.response?.data?.message || 'Failed to create gist')
  }
}

// Get file content from repo
async function getFile(repo, path, branch = 'main') {
  try {
    const response = await axios.get(
      `${GITHUB_API}/repos/${GITHUB_USERNAME}/${repo}/contents/${path}`,
      { headers, params: { ref: branch } }
    )
    
    const content = Buffer.from(response.data.content, 'base64').toString('utf8')
    return {
      content,
      sha: response.data.sha,
      path: response.data.path
    }
  } catch (error) {
    if (error.response?.status === 404) {
      return null
    }
    throw new Error(error.response?.data?.message || 'Failed to get file')
  }
}

// Create or update file in repo
async function pushFile(repo, path, content, message, branch = 'main') {
  try {
    // Check if file exists to get SHA
    const existing = await getFile(repo, path, branch)
    
    const data = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch
    }
    
    if (existing) {
      data.sha = existing.sha
    }
    
    const response = await axios.put(
      `${GITHUB_API}/repos/${GITHUB_USERNAME}/${repo}/contents/${path}`,
      data,
      { headers }
    )
    
    return {
      path: response.data.content.path,
      sha: response.data.content.sha,
      url: response.data.content.html_url,
      commitUrl: response.data.commit.html_url
    }
  } catch (error) {
    console.error('GitHub pushFile error:', error.response?.data?.message || error.message)
    throw new Error(error.response?.data?.message || 'Failed to push file')
  }
}

// Delete file from repo
async function deleteFile(repo, path, message, branch = 'main') {
  try {
    const existing = await getFile(repo, path, branch)
    if (!existing) {
      throw new Error('File not found')
    }
    
    await axios.delete(
      `${GITHUB_API}/repos/${GITHUB_USERNAME}/${repo}/contents/${path}`,
      {
        headers,
        data: {
          message,
          sha: existing.sha,
          branch
        }
      }
    )
    
    return true
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Failed to delete file')
  }
}

// List files in repo directory
async function listFiles(repo, path = '', branch = 'main') {
  try {
    const url = path 
      ? `${GITHUB_API}/repos/${GITHUB_USERNAME}/${repo}/contents/${path}`
      : `${GITHUB_API}/repos/${GITHUB_USERNAME}/${repo}/contents`
    
    const response = await axios.get(url, {
      headers,
      params: { ref: branch }
    })
    
    return response.data.map(f => ({
      name: f.name,
      path: f.path,
      type: f.type, // 'file' or 'dir'
      size: f.size
    }))
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Failed to list files')
  }
}

// Search code
async function searchCode(query, repo = null) {
  try {
    let q = query
    if (repo) {
      q += ` repo:${GITHUB_USERNAME}/${repo}`
    } else {
      q += ` user:${GITHUB_USERNAME}`
    }
    
    const response = await axios.get(`${GITHUB_API}/search/code`, {
      headers,
      params: { q, per_page: 5 }
    })
    
    return response.data.items.map(i => ({
      name: i.name,
      path: i.path,
      repo: i.repository.name,
      url: i.html_url
    }))
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Failed to search')
  }
}

module.exports = {
  listRepos,
  createRepo,
  createGist,
  getFile,
  pushFile,
  deleteFile,
  listFiles,
  searchCode,
  GITHUB_USERNAME
}
