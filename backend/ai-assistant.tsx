import React, { useState } from 'react';

const AIAssistant = () => {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setIsLoading(true);
    setError(null);
    setResponse('');

    try {
      const res = await fetch('https://5000-cs-d0bea226-d625-442f-9a76-4882186b77c6.cs-europe-west1-onse.cloudshell.dev/api/chat', {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: input }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setResponse(data.text);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-primary mb-4">مساعد تاج الخدمات الذكي</h2>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اسأل المساعد الذكي..."
          disabled={isLoading}
          className="flex-grow bg-gray-800 text-foreground border border-secondary rounded-md p-2 focus:ring-primary focus:border-primary"
        />
        <button type="submit" disabled={isLoading} className="bg-primary hover:bg-secondary text-white font-bold py-2 px-4 rounded-md disabled:bg-gray-600">
          {isLoading ? 'جاري الإرسال...' : 'إرسال'}
        </button>
      </form>
      {error && <p className="text-red-500 bg-red-900/20 p-3 rounded-md">خطأ: {error}</p>}
      {response && (
        <div className="bg-gray-800 p-4 rounded-md border border-gray-700">
          <p className="text-foreground whitespace-pre-wrap">{response}</p>
        </div>
      )}
    </div>
  );
};

export default AIAssistant;