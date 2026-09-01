/**
 * Utility for parsing GitHub Release URLs and fetching asset metadata
 */

export interface GitHubReleaseAsset {
  id: number;
  name: string;
  downloadUrl: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  contentType?: string;
}

export interface GitHubReleaseInfo {
  owner: string;
  repo: string;
  tag: string;
  releaseName: string;
  htmlUrl: string;
  assets: GitHubReleaseAsset[];
}

/**
 * Extracts owner, repo, and tag from a GitHub Release URL
 * Supports formats:
 * - https://github.com/owner/repo/releases/tag/v1.0
 * - https://github.com/owner/repo/releases/tag/map1975
 * - https://github.com/owner/repo/releases/latest
 * - https://github.com/owner/repo/releases
 * - https://github.com/owner/repo
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string; tag?: string } | null {
  const trimmed = url.trim();
  const match = trimmed.match(/github\.com\/([^/]+)\/([^/]+)(?:\/releases(?:\/tag\/([^/?#]+)|\/latest)?)?/i);
  if (!match) return null;

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');
  const tag = match[3] || (trimmed.includes('/releases/latest') ? 'latest' : undefined);

  return { owner, repo, tag };
}

/**
 * Fetches assets from a GitHub Release URL using the GitHub REST API
 */
export async function fetchGitHubReleaseAssets(url: string): Promise<GitHubReleaseInfo> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error('Đường link GitHub không hợp lệ. Vui lòng nhập link theo định dạng: https://github.com/owner/repo/releases/tag/tag_name');
  }

  const { owner, repo, tag } = parsed;
  let apiUrl = '';

  if (tag && tag !== 'latest') {
    apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`;
  } else if (tag === 'latest') {
    apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  } else {
    // If no tag specified, fetch all releases and take the first one
    apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;
  }

  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Không tìm thấy Release "${tag || 'mới nhất'}" trong repository ${owner}/${repo}. Hãy kiểm tra lại tên tag hoặc trạng thái Public của repository.`);
    }
    if (response.status === 403) {
      throw new Error('Đã vượt quá hạn ngạch gọi GitHub API tạm thời hoặc repository ở chế độ Private. Vui lòng thử lại sau ít phút.');
    }
    throw new Error(`Lỗi kết nối GitHub API (${response.status}): ${response.statusText}`);
  }

  const data = await response.json();
  const releaseData = Array.isArray(data) ? data[0] : data;

  if (!releaseData) {
    throw new Error(`Không tìm thấy bản phát hành (Release) nào trong repository ${owner}/${repo}.`);
  }

  const rawAssets = Array.isArray(releaseData.assets) ? releaseData.assets : [];
  
  // Filter for GIS raster files (.tif, .tiff, .geotiff, etc.)
  const assets: GitHubReleaseAsset[] = rawAssets
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      downloadUrl: item.browser_download_url,
      size: item.size,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      contentType: item.content_type,
    }));

  return {
    owner,
    repo,
    tag: releaseData.tag_name || tag || 'release',
    releaseName: releaseData.name || releaseData.tag_name || 'Bản đồ Raster',
    htmlUrl: releaseData.html_url || url,
    assets,
  };
}
