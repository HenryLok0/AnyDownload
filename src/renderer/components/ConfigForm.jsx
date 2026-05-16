import React, { useState } from 'react';
import { Play } from 'lucide-react';

export default function ConfigForm({ mode }) {
  const [url, setUrl] = useState('');
  const [output, setOutput] = useState('downloaded_site');
  const [concurrency, setConcurrency] = useState(5);
  const [delay, setDelay] = useState(500);
  
  const handleStart = () => {
    // We will hook this up to Electron IPC later
    if (window.electronAPI) {
      window.electronAPI.startTask({
        mode,
        url,
        output,
        concurrency,
        delay
      });
    } else {
      console.log('Task started (Mock)', { mode, url, output, concurrency, delay });
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden max-w-3xl">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-xl font-semibold text-gray-800">
          {mode === 'download' ? 'New Download Task' : 'New Path Discovery Task'}
        </h3>
        <p className="text-gray-500 mt-1">
          {mode === 'download' 
            ? 'Configure settings to crawl and download a website.' 
            : 'Discover hidden paths, sitemaps, and API endpoints.'}
        </p>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target URL</label>
          <input 
            type="text" 
            placeholder="https://example.com"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Output Folder</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              value={output}
              onChange={(e) => setOutput(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Concurrency</label>
            <input 
              type="number" 
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delay (ms)</label>
            <input 
              type="number" 
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              value={delay}
              onChange={(e) => setDelay(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
        <button 
          onClick={handleStart}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors shadow-sm"
        >
          <Play size={18} />
          Start Task
        </button>
      </div>
    </div>
  );
}
