import express from 'express';
import { requireEditorOrAdmin } from './auth';

const GITHUB_REPO_OWNER = 'thinhdaihiep';
const GITHUB_REPO_NAME = 'Web-gis-Quy-tap';
const GITHUB_RELEASE_TAG = 'TranDanh';

const getEffectiveGitHubToken = () => {
  return (
    process.env.GitHub_Access ||
    process.env.GITHUB_ACCESS ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    ''
  ).trim();
};

async function getOrCreateGitHubRelease(token: string) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'WebGIS-App/1.0',
  };

  // 1. Try to get release
  const getRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/tags/${GITHUB_RELEASE_TAG}`,
    { headers }
  );

  if (getRes.ok) {
    return await getRes.json();
  }

  // 2. If 404, create the release
  if (getRes.status === 404) {
    const createRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tag_name: GITHUB_RELEASE_TAG,
          name: 'Hồ sơ tài liệu các trận đánh lịch sử',
          body: 'Kho lưu trữ tài liệu hồ sơ trận đánh (PDF) tự động tải lên từ hệ thống WebGIS.',
          draft: false,
          prerelease: false,
        }),
      }
    );

    if (createRes.ok) {
      return await createRes.json();
    }
    const errText = await createRes.text();
    throw new Error(`Không thể khởi tạo Server lưu trữ: ${createRes.status} ${errText}`);
  }

  const errText = await getRes.text();
  throw new Error(`Không thể truy cập Server lưu trữ: ${getRes.status} ${errText}`);
}

function isSafePdfUpstream(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    // Block loopback, link-local, and private IP ranges
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '169.254.169.254' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }
    // Only allow GitHub releases of the specific repo or verified GitHub / AWS release assets
    const isAllowedRepoRelease =
      (host === 'github.com' && parsed.pathname.startsWith(`/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`)) ||
      (host === 'api.github.com' && parsed.pathname.startsWith(`/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`));

    const isAllowedCdn =
      host === 'objects.githubusercontent.com' ||
      host === 'github-releases.githubusercontent.com' ||
      host.endsWith('.githubusercontent.com') ||
      host.endsWith('.amazonaws.com');

    if (isAllowedRepoRelease || isAllowedCdn) {
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

export function registerBattleRoutes(app: express.Express) {
  // Upload battle dossier PDF to Server
  app.post('/api/battles/upload-hoso', express.json({ limit: '100mb' }), requireEditorOrAdmin, async (req, res) => {
    try {
      const token = getEffectiveGitHubToken();
      if (!token) {
        return res.status(500).json({
          error: 'Chưa cấu hình khóa truy cập Server trong biến môi trường / Secrets.',
        });
      }

      const { fileName, fileBase64, objectId, oldFileUrl } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ error: 'Thiếu nội dung file base64' });
      }

      // Convert base64 to Buffer
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(cleanBase64, 'base64');

      // Validate PDF Magic bytes: must start with %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
      if (fileBuffer.length < 5 || fileBuffer.toString('utf8', 0, 5) !== '%PDF-') {
        return res.status(400).json({ error: 'Tệp tải lên không phải là định dạng PDF hợp lệ (thiếu tiêu đề %PDF-).' });
      }

      // Format standard filename: [OBJECTID].[tên file upload]
      let uploadedName = (fileName || 'hoso.pdf')
        .replace(/[\\/:*?"<>|#]/g, '_')
        .trim();

      if (!uploadedName.toLowerCase().endsWith('.pdf')) {
        uploadedName += '.pdf';
      }

      let targetFileName = uploadedName;
      if (objectId !== undefined && objectId !== null && String(objectId).trim() !== '') {
        const prefix = `${objectId}.`;
        if (uploadedName.startsWith(prefix)) {
          targetFileName = uploadedName;
        } else {
          targetFileName = `${prefix}${uploadedName}`;
        }
      }

      // 1. Get or create release
      const release = await getOrCreateGitHubRelease(token);
      const uploadUrlTemplate = release.upload_url;
      const uploadBaseUrl = uploadUrlTemplate.replace(/\{.*?\}$/, '');

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'WebGIS-App/1.0',
      };

      // 2. Identify and delete all old asset(s) belonging to this battle to ensure complete overwrite
      if (Array.isArray(release.assets)) {
        let oldTargetName = '';
        if (oldFileUrl && typeof oldFileUrl === 'string') {
          const parts = oldFileUrl.split('/');
          oldTargetName = decodeURIComponent(parts[parts.length - 1]).toLowerCase();
        }

        const objectIdPrefix =
          objectId !== undefined && objectId !== null ? `${objectId}.`.toLowerCase() : null;
        const targetLower = targetFileName.toLowerCase();

        const assetsToDelete = release.assets.filter((a: any) => {
          if (!a || !a.name) return false;
          const aName = a.name.toLowerCase();
          if (aName === targetLower) return true;
          if (oldTargetName && aName === oldTargetName) return true;
          if (objectIdPrefix && aName.startsWith(objectIdPrefix) && aName.endsWith('.pdf')) return true;
          return false;
        });

        for (const oldAsset of assetsToDelete) {
          if (oldAsset && oldAsset.id) {
            try {
              await fetch(
                `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/assets/${oldAsset.id}`,
                {
                  method: 'DELETE',
                  headers,
                }
              );
            } catch (delErr) {
              console.warn(`Lỗi khi xóa asset cũ (${oldAsset.name}) trước khi ghi đè:`, delErr);
            }
          }
        }
      }

      // 3. Upload new asset
      const uploadUrl = `${uploadBaseUrl}?name=${encodeURIComponent(targetFileName)}`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/pdf',
          'Content-Length': String(fileBuffer.length),
        },
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        return res.status(uploadRes.status).json({
          error: `Tải file lên Server thất bại: ${uploadRes.status} ${errText}`,
        });
      }

      const assetData = await uploadRes.json();
      const directDownloadUrl =
        assetData.browser_download_url ||
        `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/download/${GITHUB_RELEASE_TAG}/${encodeURIComponent(targetFileName)}`;

      res.json({
        success: true,
        fileName: targetFileName,
        url: directDownloadUrl,
        assetId: assetData.id,
      });
    } catch (err: any) {
      console.error('[API POST /api/battles/upload-hoso] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi khi upload hồ sơ trận đánh lên Server' });
    }
  });

  // Delete battle dossier PDF from GitHub Release
  app.post('/api/battles/delete-hoso', requireEditorOrAdmin, async (req, res) => {
    try {
      const token = getEffectiveGitHubToken();
      const { fileUrl, fileName, objectId } = req.body;

      if (!fileUrl && !fileName && objectId === undefined) {
        return res.status(400).json({ error: 'Thiếu thông tin URL, tên file hoặc objectId cần xóa' });
      }

      // If token not provided, simply acknowledge so client can clear HoSo property
      if (!token) {
        return res.json({ success: true, message: 'Đã xóa liên kết hồ sơ trên hệ thống' });
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'WebGIS-App/1.0',
      };

      // Extract target file name
      let targetName = fileName;
      if (!targetName && fileUrl) {
        const parts = fileUrl.split('/');
        targetName = decodeURIComponent(parts[parts.length - 1]);
      }

      const releaseRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/tags/${GITHUB_RELEASE_TAG}`,
        { headers }
      );

      if (releaseRes.ok) {
        const release = await releaseRes.json();
        if (Array.isArray(release.assets)) {
          const targetLower = (targetName || '').toLowerCase();
          const objectIdPrefix =
            objectId !== undefined && objectId !== null ? `${objectId}.`.toLowerCase() : null;

          const matchedAssets = release.assets.filter((a: any) => {
            if (!a || !a.name) return false;
            const aName = a.name.toLowerCase();
            if (targetLower && aName === targetLower) return true;
            if (objectIdPrefix && aName.startsWith(objectIdPrefix) && aName.endsWith('.pdf')) return true;
            return false;
          });

          for (const matched of matchedAssets) {
            if (matched && matched.id) {
              await fetch(
                `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/assets/${matched.id}`,
                {
                  method: 'DELETE',
                  headers,
                }
              );
            }
          }
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/battles/delete-hoso] Error:', err);
      res.json({ success: true, warning: err.message });
    }
  });

  // Proxy endpoint to stream PDF for in-app viewer (prevents cross-origin download forcing)
  app.get('/api/battles/proxy-pdf', async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: 'Missing url query parameter' });
      }

      if (!isSafePdfUpstream(url)) {
        return res.status(403).json({ error: 'Forbidden: Địa chỉ PDF không hợp lệ hoặc không thuộc kho lưu trữ cho phép' });
      }

      const token = getEffectiveGitHubToken();
      let currentUrl = url;
      let hops = 0;
      let upstreamRes: Response | null = null;

      // Handle redirect chain (GitHub releases redirect to AWS S3/CDN)
      while (hops < 6) {
        if (!isSafePdfUpstream(currentUrl)) {
          return res.status(403).json({ error: 'Forbidden: Địa chỉ chuyển hướng không an toàn' });
        }

        const parsedUrl = new URL(currentUrl);
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebGIS/1.0',
        };

        // ONLY attach GitHub token to github.com / api.github.com, NEVER AWS S3 or third parties!
        if (token && (parsedUrl.hostname === 'github.com' || parsedUrl.hostname === 'api.github.com')) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response: Response = await fetch(currentUrl, {
          headers,
          redirect: 'manual',
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const loc = response.headers.get('location');
          if (loc) {
            currentUrl = new URL(loc, currentUrl).toString();
            hops++;
            continue;
          }
        }

        upstreamRes = response;
        break;
      }

      if (!upstreamRes || !upstreamRes.ok) {
        const status = upstreamRes ? upstreamRes.status : 502;
        return res.status(status).send(`Failed to fetch PDF upstream: ${upstreamRes?.statusText || 'Error'}`);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="hoso.pdf"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.removeHeader('X-Frame-Options');

      const arrayBuffer = await upstreamRes.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      console.error('[API GET /api/battles/proxy-pdf] Error:', err);
      res.status(500).json({ error: err.message || 'Cannot stream PDF file' });
    }
  });
}
