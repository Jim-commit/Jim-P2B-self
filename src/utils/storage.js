import { supabase } from '../lib/supabase.js';

// =========================================================================
// 客户端图片压缩 + Supabase Storage 外置图床上传（失败自动回退 Base64）
// =========================================================================
export function compressImageFile(file, maxDim = 600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        } else if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadBlobToStorage(base64Data, tenantId, folder = 'products') {
  if (!base64Data || !base64Data.startsWith('data:image')) return base64Data;
  try {
    const res = await fetch(base64Data);
    const blob = await res.blob();
    const fileName = `${folder}/${tenantId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage
      .from('supply-images')
      .upload(fileName, blob, { contentType: 'image/jpeg' });
    if (error) return base64Data;
    const { data } = supabase.storage.from('supply-images').getPublicUrl(fileName);
    return data?.publicUrl || base64Data;
  } catch (e) {
    return base64Data;
  }
}

// =========================================================================
// 通用 UTF-8 BOM CSV 导出器（Excel 打开零乱码）
// =========================================================================
export function downloadCSV(filename, headers, rows) {
  const csvContent =
    '\uFEFF' +
    [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
