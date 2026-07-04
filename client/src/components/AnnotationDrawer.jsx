import React from 'react';

export default function AnnotationDrawer({ annotation, onClose, onDelete }) {
  if (!annotation) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-96 bg-white dark:bg-gray-800 shadow-xl h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold">批注详情</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400">选中文本</label>
            <p className="mt-1 font-medium">{annotation.selected_text}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400">批注内容</label>
            <textarea
              className="mt-1 w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              rows={4}
              defaultValue={annotation.note_content || ''}
              readOnly={!onDelete}
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400">创建时间</label>
            <p className="mt-1 text-sm">{annotation.created_at}</p>
          </div>
          {onDelete && (
            <button
              onClick={() => onDelete(annotation.annotation_id)}
              className="w-full py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              删除批注
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
