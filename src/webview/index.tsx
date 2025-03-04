import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@/styles/globals.css';

console.log('Debug: React entry point loaded');
console.log('Debug: React version:', React.version);
console.log('Debug: createRoot available:', typeof createRoot === 'function');

// Get VS Code API
declare global {
    interface Window {
        acquireVsCodeApi(): any;
        vscodeApi?: any;
    }
}

// Get VS Code API once and store it
if (!window.vscodeApi) {
    try {
        console.log('Debug: Attempting to acquire VS Code API');
        window.vscodeApi = window.acquireVsCodeApi();
        console.log('Debug: VS Code API acquired and stored');
    } catch (error) {
        console.error('Debug: Error acquiring VS Code API:', error);
    }
}

function renderApp() {
    try {
        // Create root element
        console.log('Debug: Looking for root element');
        const container = document.getElementById('root');
        if (!container) {
            console.error('Debug: Root element not found!');
            console.log('Debug: Available elements:', document.body.innerHTML);
            throw new Error('#root element not found');
        }
        console.log('Debug: Root element found');

        // First render a simple div to test React is working
        console.log('Debug: Creating React root');
        const root = createRoot(container);
        console.log('Debug: Rendering test div');
        
        try {
            root.render(
                <div className="flex flex-col items-center justify-center h-full p-4">
                    <div className="animate-pulse text-center">
                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent mb-3"></div>
                        <p>Loading mcpsx-run...</p>
                    </div>
                </div>
            );
            console.log('Debug: Initial loading render complete');

            // If that works, render the actual app
            setTimeout(() => {
                try {
                    console.log('Debug: Rendering App component');
                    root.render(
                        <React.StrictMode>
                            <App />
                        </React.StrictMode>
                    );
                    console.log('Debug: App render complete');
                } catch (error: unknown) {
                    console.error('Debug: Error rendering App:', error);
                }
            }, 500);
        } catch (error: unknown) {
            console.error('Debug: Error in initial render:', error);
        }
    } catch (error) {
        console.error('Debug: Error in React initialization:', error);
        // Try to show the error in the UI
        const container = document.getElementById('root');
        if (container && error instanceof Error) {
            const errorRoot = createRoot(container);
            errorRoot.render(
                <div style={{ color: 'red' }}>Error: {error.message}</div>
            );
        }
    }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    console.log('Debug: Document still loading, waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Debug: DOMContentLoaded fired');
        renderApp();
    });
} else {
    console.log('Debug: Document already loaded, rendering immediately');
    renderApp();
} 