import React, { useState, useRef, useEffect } from 'react';
import { Send, Code, Eye, EyeOff, Download, BookOpen, CheckCircle, Edit, FileText } from 'lucide-react';
import './DeckAgent.css';
const DeckAgent = () => {
  const [messages, setMessages] = useState([
    { id: 1, type: 'assistant', content: "Hello! I'm DeckAgent. Give me a topic, I'll do some research and generate a presentation for you." }
  ]);
  const [input, setInput] = useState('');
  const [slides, setSlides] = useState([]);
  const [showCode, setShowCode] = useState({});
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const iframeRefs = useRef({});

  // Create new session
  useEffect(() => {
    const createSession = async () => {
      try {
        const response = await fetch('/api/agent/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSessionId(data.sessionId || data.id);
          console.log('Session created:', data);
        } else {
          console.error('Failed to create session:', response.status);
        }
      } catch (error) {
        console.error('Error creating session:', error);
      }
    };

    createSession();
  }, []);

  useEffect(() => {
    slides.forEach((slide, index) => {
      if (iframeRefs.current[index]) {
        const doc = iframeRefs.current[index].contentDocument;
        doc.open();
        doc.write(slide.html);
        doc.close();
      }
    });
  }, [slides]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userInput = input.trim();
    const newMessage = { id: messages.length + 1, type: 'user', content: userInput };
    setMessages([...messages, newMessage]);

    setInput('');

    // If sessionId exists, send message to API
    if (sessionId) {
      setIsLoading(true);
      try {
        let requestBody: string | FormData;
        let headers: Record<string, string> = {};
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify({
          app_name: "deck_agent",
          user_id: "u_123",
          session_id: sessionId,
          new_message: {
            role: "user",
            parts: [{
              text: userInput,
            }]
          },
        });
        const response = await fetch('/api/agent/run', {
          method: 'POST',
          headers,
          body: requestBody,
        });
        if (response.ok) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let rawText = '';

          // Read the entire stream
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            rawText += decoder.decode(value, { stream: true });
          }

          // Process AI response
          if (rawText) {
            console.log('Raw response:', rawText);
            try {
              // Try to parse JSON response
              const parsedResponse = JSON.parse(rawText);
              console.log('Parsed response:', parsedResponse);

              // Check multiple possible response structures
              let events = null;
              if (parsedResponse.events && Array.isArray(parsedResponse.events)) {
                events = parsedResponse.events;
              } else if (Array.isArray(parsedResponse)) {
                events = parsedResponse;
              } else if (parsedResponse.data?.events) {
                events = parsedResponse.data.events;
              }

              if (events) {
                console.log('Found events array with', events.length, 'events');
                let slidesFound = false;
                let assistantMessage = '';

                // Process each event
                for (const event of events) {
                  console.log('Processing event:', event.author, event.id);
                  if (event.content?.parts) {
                    for (const part of event.content.parts) {
                      console.log('Part:', part);
                      // Check for function response with slides
                      if (part.functionResponse?.response?.result) {
                        const responseResult = part.functionResponse.response.result;
                        console.log('Found function response, length:', responseResult.length);
                        console.log('First 500 chars:', responseResult.substring(0, 500));

                        const slidesData = detectAndParseSlides(responseResult);
                        if (slidesData) {
                          console.log('Slides detected:', slidesData);
                          setSlides(slidesData);
                          slidesFound = true;
                        } else if (responseResult.includes('<Slides>')) {
                          // If we detect slides tag but can't parse, still indicate slides were generated
                          console.log('Slides tag detected but parsing failed');
                          slidesFound = true;
                          // Try to extract at least the text content for display
                          const lastEvent = events[events.length - 1];
                          if (lastEvent?.content?.parts?.[0]?.text) {
                            assistantMessage = lastEvent.content.parts[0].text;
                          }
                        }
                      }
                      // Get the assistant's explanatory text
                      if (part.text && event.author === 'coordinator') {
                        assistantMessage = part.text;
                      }
                    }
                  }
                }
                setMessages(prev => [...prev, { id: prev.length + 1, type: 'assistant', content: assistantMessage }]);
              }
            } catch (error) {
              console.error('Error processing response:', error);
            }
          }
        } else {
          console.error('Failed to send message:', response.status);
        }
      } catch (error) {
        console.error('Error sending message:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };


  const toggleCode = (slideId) => {
    setShowCode(prev => ({
      ...prev,
      [slideId]: !prev[slideId]
    }));
  };

  const extractTitleFromHTML = (html) => {
    const match = html.match(/<title>([^<]+)<\/title>/);
    return match ? match[1] : 'Untitled Slide';
  };

  // Detect and parse slides format
  const detectAndParseSlides = (text: string) => {
    try {
      // Check if contains <Slides> tag
      const slidesMatch = text.match(/<Slides>([\s\S]*?)<\/Slides>/i);
      if (slidesMatch) {
        const slidesContent = slidesMatch[1].trim();
        try {
          const parsed = JSON.parse(slidesContent);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch (e) {
          console.error('Failed to parse Slides tag content:', e);
          // Try to extract partial slides if JSON is incomplete
          const slideMatches = slidesContent.matchAll(/\{\s*"id"\s*:\s*"([^"]+)"\s*,\s*"title"\s*:\s*"([^"]+)"\s*,\s*"html"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g);
          const slides = [];
          for (const match of slideMatches) {
            try {
              slides.push({
                id: match[1],
                title: match[2],
                html: match[3].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
              });
            } catch (err) {
              console.error('Error parsing slide:', err);
            }
          }
          if (slides.length > 0) {
            console.log('Extracted partial slides:', slides.length);
            return slides;
          }
        }
      }

      // Try to parse JSON directly
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].html) {
        return parsed;
      }

      return null;
    } catch (error) {
      console.error('Error in detectAndParseSlides:', error);
      return null;
    }
  };

  // Parse text content from response
  const parseResponseText = (response: any): string => {
    try {
      // If it's a string, return directly
      if (typeof response === 'string') {
        return response;
      }

      // If it's an object, try to parse
      if (typeof response === 'object' && response !== null) {
        // Check for events array structure (from agent response)
        if (Array.isArray(response.events)) {
          // Look for the last event with text content
          for (let i = response.events.length - 1; i >= 0; i--) {
            const event = response.events[i];
            if (event.content?.parts) {
              for (const part of event.content.parts) {
                if (part.text) {
                  return part.text;
                }
                // Check for function response
                if (part.function_response?.response?.result) {
                  return part.function_response.response.result;
                }
              }
            }
          }
        }

        // Check if has content.parts[0].text structure
        if (response.content?.parts?.[0]?.text) {
          return response.content.parts[0].text;
        }

        // Check if has direct text field
        if (response.text) {
          return response.text;
        }

        // Check if has content field
        if (response.content) {
          if (typeof response.content === 'string') {
            return response.content;
          }
          if (response.content.text) {
            return response.content.text;
          }
        }

        // If it's an array, try to parse the first element
        if (Array.isArray(response)) {
          return parseResponseText(response[0]);
        }
      }

      // If unable to parse, return string representation of original response
      return JSON.stringify(response);
    } catch (error) {
      console.error('Error parsing response text:', error);
      return 'Unable to parse response content';
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left side chat interface */}
      <div className="w-1/3 bg-white shadow-lg flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4">
          <h1 className="text-2xl font-bold flex items-center">
            <BookOpen className="mr-2" size={28} />
            DeckAgent
          </h1>
          <p className="text-sm opacity-90">From topic to teachable moment, instantly.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${message.type === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
                  }`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-xs px-4 py-2 rounded-lg bg-gray-200 text-gray-800">
                <div className="flex items-center space-x-2">
                  <div className="animate-pulse flex space-x-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animation-delay-200"></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animation-delay-400"></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <div className="mb-3">
            <p className="text-sm text-gray-600">
              💡 Pythagorean Theorem, Proportional Relationship, etc.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
              placeholder="Teaching topic ..."
              className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !input.trim()}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Right side content display area */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {slides.length === 0 ? (
          // Initial state
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <i className="fas fa-presentation text-8xl text-gray-300 mb-4"></i>
              <p className="text-xl text-gray-500">Please enter your teaching topic on the left</p>
              <p className="text-gray-400 mt-2">DeckAgent will research your topic and create a complete presentation</p>
            </div>
          </div>
        ) : (
          // Display slides
          <div className="p-6 space-y-6">
            {/* Title bar */}
            <div className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">
                {slides[0]?.title || 'Complete Presentation'}
              </h2>
              <button className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 flex items-center space-x-2">
                <Download size={16} />
                <span>Export Presentation</span>
              </button>
            </div>

            {/* Slides list */}
            <div className="space-y-6">
              {slides.map((slide, index) => (
                <div key={slide.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                  {/* Slide preview */}
                  <div className="relative" style={{ height: '450px' }}>
                    <iframe
                      ref={el => iframeRefs.current[index] = el}
                      className="w-full h-full"
                      style={{
                        transform: 'scale(0.7)',
                        transformOrigin: 'top left',
                        width: '142.86%',
                        height: '142.86%'
                      }}
                      title={`Slide ${index + 1}`}
                    />
                    <div className="absolute top-4 right-4">
                      <button
                        onClick={() => toggleCode(slide.id)}
                        className="p-2 bg-black/50 text-white rounded hover:bg-black/70 transition-colors"
                        title={showCode[slide.id] ? "Hide Code" : "Show Code"}
                      >
                        {showCode[slide.id] ? <EyeOff size={20} /> : <Code size={20} />}
                      </button>
                    </div>
                  </div>

                  {/* HTML code display */}
                  {showCode[slide.id] && (
                    <div className="bg-gray-900 text-gray-100 p-4 max-h-64 overflow-y-auto">
                      <pre className="text-xs font-mono">
                        <code>{slide.html}</code>
                      </pre>
                    </div>
                  )}

                  {/* Slide information */}
                  <div className="bg-gray-50 px-4 py-3 border-t">
                    <p className="text-sm text-gray-600">
                      Slide {index + 1} - {slide.title || extractTitleFromHTML(slide.html)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeckAgent;