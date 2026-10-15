# RockfishV1.0

Rockfish reads the position on a chess.com or lichess.org board and shows the top 3 engine moves as arrows, plus the opponent's biggest threat and an eval bar. The engine (Stockfish, WASM) runs locally inside the extension. Nothing is sent to a server.

> **Use Rockfish only in situations of struggle**.
>
> **The author is not at fault or responsible for any bans, account actions or other consequences of using this extension.** You use it entirely at your own risk.

## What it shows

- **Green arrow:** the best move.
- **Yellow arrow:** the second-best move.
- **Orange arrow:** the third-best move.
- **Red arrow:** the opponent's biggest threat.

## Install & Use


https://github.com/user-attachments/assets/babd1f83-0a42-424b-95a0-cfe674849dc2

### Must be used in a live game.


### Other ways to use it

- **Paste a FEN:** if the page cannot be read, open **Advanced**, paste a FEN and press **Analyse pasted FEN** or Enter. Live updates stop for a pasted position so it is never overwritten.

### Notes on what is read

- Piece placement is read from the page.
- Castling rights are inferred from the king and rook positions.
- The side to move is assumed to be White unless you use the switch or a pasted FEN.

## Credits

- **Rockfish** by Afluenza.
- **Stockfish** (GPL-3.0), the chess engine that runs in the extension. Stockfish is developed by the Stockfish authors. See `engine/LICENSE-stockfish.txt`.
- **chess.com** and **lichess.org**, whose boards Rockfish reads.

## Licence and terms

The extension's own code is MIT but separate from the Stockfish engine files. Distributing the engine means the GPL-3.0 terms apply to those files. Check the terms before you publish a build.
