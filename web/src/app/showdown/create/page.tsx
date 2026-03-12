import Link from "next/link";

export const metadata = {
  title: "Create a Showdown — MTG Ink",
  description: "Build your own custom showdown",
  robots: { index: false, follow: false },
};

export default function CreateShowdownPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-16 flex items-center justify-center">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold mb-2">Create a Showdown</h1>
        <p className="text-gray-400 mb-8">
          Build your own custom remix, VS, or gauntlet. Coming soon.
        </p>
        <Link
          href="/"
          className="px-5 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
