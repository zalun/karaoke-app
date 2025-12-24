import { AppLayout } from "./components/layout";

function App() {
  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
        {/* Video Player Area */}
        <div className="lg:col-span-2 bg-gray-800 rounded-lg flex items-center justify-center min-h-[300px]">
          <div className="text-center text-gray-400">
            <p className="text-4xl mb-2">🎤</p>
            <p>Search for a song to start</p>
          </div>
        </div>

        {/* Queue Panel */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Queue</h2>
          <div className="text-gray-400 text-sm">
            <p>No songs in queue</p>
            <p className="mt-2 text-xs">
              Search for songs and add them to the queue
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default App;
