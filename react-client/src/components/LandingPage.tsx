export default function LandingPage() {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-3xl font-bold mb-4">Welcome to the Real-time Multiplayer Game</h1>
        <a href="/room" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">Get Started</a>
      </div>
    );
  }