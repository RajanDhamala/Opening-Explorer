import axios from "axios";
import { useQuery } from "@tanstack/react-query";

type GameResult = "win" | "loss" | "draw" | string;

interface GameListItem {
  _id: string;
  gameurl: string;
  whiteusername: string;
  blackusername: string;
  whiterating: number;
  blackrating: number;
  playercolor: string;
  timeclass: string;
  result: GameResult;
  issuecount: number;
  user_id: number;
  createdat: string;
}

interface GamesListResponse {
  data?: GameListItem[];
}

const fetchGamesList = async (): Promise<GameListItem[]> => {
  const response = await axios.get<GamesListResponse>(
    "http://localhost:3030/games/list",
    { withCredentials: true }
  );

  return Array.isArray(response.data?.data) ? response.data.data : [];
};

const getResultBadgeClasses = (result: string) => {
  if (result === "win") return "bg-emerald-500/15 text-emerald-300 border-emerald-700/40";
  if (result === "loss") return "bg-rose-500/15 text-rose-300 border-rose-700/40";
  return "bg-neutral-800 text-neutral-300 border-neutral-700";
};

const ListPage = () => {
  const {
    data: games = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["games-list"],
    queryFn: fetchGamesList,
  });

  const totalIssues = games.reduce((sum, game) => sum + game.issuecount, 0);
  const errorMessage =
    axios.isAxiosError(error) && error.response?.data?.message
      ? String(error.response.data.message)
      : "Could not load games list right now.";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Processed Games
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                List of analyzed games and issue counts from
                <span className="mx-1 font-medium text-neutral-300">/games/list</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 px-4 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isFetching ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Total games</p>
              <p className="mt-1 text-2xl font-semibold">{games.length}</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Total issues</p>
              <p className="mt-1 text-2xl font-semibold">{totalIssues}</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Endpoint</p>
              <p className="mt-1 truncate text-sm text-neutral-300">
                http://localhost:3030/games/list
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 text-neutral-300">
            Loading games...
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-rose-800/60 bg-rose-950/30 p-6 text-rose-200">
            {errorMessage}
          </div>
        ) : games.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 text-neutral-300">
            No processed games found.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="hidden overflow-hidden rounded-2xl border border-neutral-800 md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-800 bg-neutral-900/70">
                  <thead className="bg-neutral-900">
                    <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Players</th>
                      <th className="px-4 py-3">Ratings</th>
                      <th className="px-4 py-3">Color</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Result</th>
                      <th className="px-4 py-3">Issues</th>
                      <th className="px-4 py-3">Game</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 text-sm text-neutral-200">
                    {games.map((game) => (
                      <tr key={game._id} className="hover:bg-neutral-900/80">
                        <td className="px-4 py-3 text-neutral-300">{game.createdat}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{game.whiteusername}</div>
                          <div className="text-neutral-400">vs {game.blackusername}</div>
                        </td>
                        <td className="px-4 py-3 text-neutral-300">
                          {game.whiterating} / {game.blackrating}
                        </td>
                        <td className="px-4 py-3 capitalize text-neutral-300">{game.playercolor}</td>
                        <td className="px-4 py-3 uppercase text-neutral-300">{game.timeclass}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getResultBadgeClasses(game.result)}`}
                          >
                            {game.result}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-amber-300">{game.issuecount}</td>
                        <td className="px-4 py-3">
                          <a
                            href={game.gameurl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-neutral-200 underline decoration-neutral-600 underline-offset-2 hover:text-white"
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-3 md:hidden">
              {games.map((game) => (
                <article
                  key={game._id}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">
                        {game.whiteusername} vs {game.blackusername}
                      </p>
                      <p className="text-xs text-neutral-400">{game.createdat}</p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getResultBadgeClasses(game.result)}`}
                    >
                      {game.result}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p className="text-neutral-400">
                      Ratings:
                      <span className="ml-1 text-neutral-200">
                        {game.whiterating}/{game.blackrating}
                      </span>
                    </p>
                    <p className="text-neutral-400">
                      Color:
                      <span className="ml-1 capitalize text-neutral-200">{game.playercolor}</span>
                    </p>
                    <p className="text-neutral-400">
                      Time:
                      <span className="ml-1 uppercase text-neutral-200">{game.timeclass}</span>
                    </p>
                    <p className="text-neutral-400">
                      Issues:
                      <span className="ml-1 font-semibold text-amber-300">{game.issuecount}</span>
                    </p>
                  </div>

                  <a
                    href={game.gameurl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-sm text-neutral-200 underline decoration-neutral-600 underline-offset-2 hover:text-white"
                  >
                    Open game
                  </a>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ListPage;
