export const K_AUTHENTICATED = 32;
export const K_ANONYMOUS = 16;
const DEFAULT_RATING = 1500;

export function calculateElo(
  winnerRating: number,
  loserRating: number,
  k: number = K_AUTHENTICATED
): { newWinnerRating: number; newLoserRating: number } {
  const expectedWinner =
    1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  return {
    newWinnerRating: winnerRating + k * (1 - expectedWinner),
    newLoserRating: loserRating + k * (0 - expectedLoser),
  };
}

export { DEFAULT_RATING };
