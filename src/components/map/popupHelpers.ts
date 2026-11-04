import { GeoJsonFeatureItem } from '../../types';
import {
  getFieldAlias,
  sortPropertyRows,
  isFieldHidden,
  extractObjectId,
} from '../../fieldAlias';
import { getSchemaForLayer } from '../../FieldSchema';
import { cleanShapeProperties } from '../../utils/shapeFieldUtils';
import { formatDateForDisplay } from '../../utils/dateFormatter';

export function renderFeedbackButtonHtml(feat: GeoJsonFeatureItem, layerName?: string): string {
  const objId = extractObjectId(feat) || feat.code || feat.id;
  const layerId = feat.layerId || 'layer1_tim_kiem';
  const { name: title } = getFeatureName(feat);
  const effLayerName = layerName || 'Lớp bản đồ';

  return `
    <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
      <button type="button" onclick="if(window.__openGisFeedbackModal){window.__openGisFeedbackModal('${encodeURIComponent(String(objId))}','${encodeURIComponent(String(layerId))}','${encodeURIComponent(String(title))}','${encodeURIComponent(String(effLayerName))}')}" style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background-color: #0284c7; color: #ffffff; border: none; border-radius: 4px; font-weight: bold; font-size: 11px; line-height: 1.2; box-shadow: 0 1px 2px rgba(0,0,0,0.1);" title="Góp ý đối tượng này">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
        <span>Góp ý</span>
      </button>
    </div>
  `;
}

export function getFeatureName(feat: GeoJsonFeatureItem): { name: string; hiddenKey: string | null } {
  const props = feat.properties || {};

  // 1. Highest Priority: Exact property field [Ten] from database
  if (props['Ten'] !== undefined && props['Ten'] !== null && String(props['Ten']).trim() !== '') {
    return { name: String(props['Ten']).trim(), hiddenKey: 'Ten' };
  }

  // 2. Feature object name if non-generic
  if (feat.name && !['Feature', 'Polygon', 'Point', 'LineString', 'MultiPolygon', 'MultiLineString'].includes(feat.name.trim())) {
    return { name: feat.name.trim(), hiddenKey: null };
  }

  // 3. Exact property field [ten] if imported with lowercase key
  if (props['ten'] !== undefined && props['ten'] !== null && String(props['ten']).trim() !== '') {
    return { name: String(props['ten']).trim(), hiddenKey: 'ten' };
  }

  // 4. Exact property field [TEN] if imported with uppercase key
  if (props['TEN'] !== undefined && props['TEN'] !== null && String(props['TEN']).trim() !== '') {
    return { name: String(props['TEN']).trim(), hiddenKey: 'TEN' };
  }

  // 5. Check other property keys mapped to alias 'Tên' or 'name'/'Name'
  for (const k of Object.keys(props)) {
    const val = props[k];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      const alias = getFieldAlias(k);
      if (alias === 'Tên' || k === 'name' || k === 'Name') {
        return { name: String(val).trim(), hiddenKey: k };
      }
    }
  }

  return { name: feat.name || 'Đối tượng GIS', hiddenKey: null };
}

export function renderPopupProperties(
  feat: GeoJsonFeatureItem,
  lat?: number,
  lng?: number,
  hiddenKey?: string | null,
  layerId?: string
): string {
  const effectiveLayerId = layerId || feat.layerId;
  const rawProps = feat.properties || {};
  const props: Record<string, any> = cleanShapeProperties({ ...rawProps });

  // 1. Lấy Schema chuẩn theo lớp
  const schemaFields = getSchemaForLayer(effectiveLayerId);

  // Helper tìm giá trị thuộc tính không phân biệt hoa thường
  const getPropValue = (key: string) => {
    if (props[key] !== undefined && props[key] !== null) return props[key];
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(props)) {
      if (k.toLowerCase() === lower && v !== undefined && v !== null) {
        return v;
      }
    }
    return '';
  };

  let hasToaDo = false;
  const validItems: { key: string; alias: string; value: string }[] = [];

  // Tầng 1: Lặp theo đúng các trường được quy định trong Schema của lớp (Schema-driven Whitelist)
  schemaFields.forEach((field) => {
    const fieldName = field.name;

    // 1. Loại trừ trường đang được dùng làm tiêu đề lớn của popup (hiddenKey) để tránh lặp thông tin
    if (hiddenKey && fieldName.toLowerCase() === hiddenKey.toLowerCase()) {
      return;
    }

    // 2. Tầng 2: Kiểm tra Checkbox hiển thị ở Tab Field Alias (isFieldHidden)
    // Nếu người dùng bỏ chọn checkbox thì ẩn trường này
    if (isFieldHidden(fieldName) || (field.alias && isFieldHidden(field.alias))) {
      return;
    }

    const val = getPropValue(fieldName);
    const alias = getFieldAlias(fieldName) || field.alias || fieldName;

    if (alias === 'Tọa độ' || fieldName === 'ToaDo' || fieldName.toLowerCase() === 'toado') {
      hasToaDo = true;
    }

    const formattedVal = formatDateForDisplay(val, fieldName, alias);
    const valStr =
      formattedVal !== ''
        ? formattedVal
        : val !== null && val !== undefined && String(val).trim() !== ''
        ? String(val)
        : '---';

    validItems.push({ key: fieldName, alias, value: valStr });
  });

  const sortedItems = sortPropertyRows(
    validItems.map((item) => ({ rawKey: item.key, aliasLabel: item.alias, value: item.value }))
  );

  const rows: string[] = sortedItems.map((item) => {
    return `<tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 3px 8px 3px 0; color: #475569; font-weight: 600; white-space: nowrap; vertical-align: top;">${item.aliasLabel}:</td>
      <td style="padding: 3px 0; color: #0f172a; font-weight: 700; text-align: right; word-break: break-word;">${item.value}</td>
    </tr>`;
  });

  if (
    !hasToaDo &&
    !isFieldHidden('ToaDo') &&
    !isFieldHidden('toado') &&
    !isFieldHidden('Tọa độ') &&
    lat !== undefined &&
    lng !== undefined
  ) {
    rows.push(`<tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 3px 8px 3px 0; color: #475569; font-weight: 600; white-space: nowrap; vertical-align: top;">Tọa độ:</td>
      <td style="padding: 3px 0; color: #0f172a; font-weight: 700; text-align: right; font-family: monospace;">${lat.toFixed(6)}, ${lng.toFixed(6)}</td>
    </tr>`);
  }

  if (rows.length === 0) {
    return '';
  }

  return `<table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px;"><tbody>${rows.join('')}</tbody></table>`;
}

export function getShortRasterName(f: { fileName?: string; name?: string; url?: string }): string {
  let name = f.fileName || f.name || '';
  if (!name && f.url) {
    try {
      const parts = f.url.split('/');
      name = decodeURIComponent(parts[parts.length - 1] || '').split('?')[0];
    } catch {
      name = f.url.split('/').pop() || '';
    }
  }
  return name.replace(/\.(tif|tiff|geotiff|cog|png|jpg|jpeg)$/i, '').trim();
}
