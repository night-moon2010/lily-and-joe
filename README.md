# Lily & Joe — Our Little World (Stage 3)

A tiny top-down pixel-art room for two cats, Lily (white) and Joe (black), shared by two real people.
Stage 3 adds private rooms with an invitation code and real-time sync through Firebase.
You can still play solo on one device.

## 1. Set up Firebase (free Spark plan, about 10 minutes)

1. Go to https://console.firebase.google.com and create a project. Google Analytics is not needed.
2. **Authentication**: Build > Authentication > Get started > Sign-in method > enable **Anonymous**.
3. **Realtime Database**: Build > Realtime Database > Create database. Pick the region closest to you
   and start in **locked mode**.
4. **Rules**: in the database's **Rules** tab, paste the whole content of `firebase/database.rules.json` and Publish.
5. **Web app**: Project settings (gear icon) > Your apps > Add app > Web (`</>`). Copy the `firebaseConfig` values
   into `js/firebase-config.js`. Make sure `databaseURL` is the exact URL shown on the Realtime Database page
   (outside the US it looks like `https://NAME-default-rtdb.europe-west1.firebasedatabase.app`).
6. These config values identify your project and are not secrets. Your data is protected by the rules.
   Optionally, in Google Cloud Console > APIs & Services > Credentials, restrict the browser key to your website address.

## 2. Run it

Firebase sign-in does not work when you double-click the file (`file://`), so use one of these:

- **GitHub Pages** (the real thing): push this folder to a GitHub repository, then Settings > Pages > Deploy from a branch
  > `main` / root. After a minute your game is at `https://YOUR-NAME.github.io/REPO/`.
  Then in Firebase: Authentication > Settings > Authorized domains > add `YOUR-NAME.github.io`.
- **On your computer**: in this folder run `python -m http.server 8000` and open http://localhost:8000.

Solo play still works from a double-click, with no Firebase at all.

## 3. Play together

1. Player A opens the game, types a name and chooses **Create a room**. An 8-character code appears (for example `8T6R-MGYF`).
2. Player A sends the code (or the invite link) to Player B.
3. Player B opens the game, types a name, enters the code and chooses **Join a room**.
4. Both see the same room. Feed, play, bathe, pet and put the cats to bed from either side. Each action shows up
   for the other person ("Ben fed Lily."). The bar under the title shows your connection and whether your partner is here.

A room holds exactly two players. Each browser is remembered, so closing the tab and coming back reconnects you.
If one of you clears the browser's site data, that browser becomes a new identity and can no longer enter the room.
Use two different browsers (or one normal and one private window) when testing alone: two tabs of the same browser are the same player.

## How the sync works

- One player at a time is the **leader**: their browser runs the cats' decisions and the care rules and publishes a small
  snapshot only when something changes (about once every few seconds), not every frame.
- The other player **follows**: their browser replays the same movement from each snapshot. Buttons they press are sent to
  the leader as commands. If the leader leaves, the other player takes over from the last snapshot.
- Care stats and the bond are saved to the database about every 30 seconds and after each care action. Time passes
  while nobody is playing: the first person back sees the cats a little hungrier.
- Data layout and what each part is for are described at the top of `js/multiplayer.js`.

## Security, honestly

The rules (`firebase/database.rules.json`) make sure that only the two players of a room can read or write it, a third
person cannot join, values stay in range, and each person can only write messages as themselves. The room code is the key to
the room, so share it only with your partner.
Without a server (no paid services, no Cloud Functions) the leader's browser decides game outcomes, so a determined member
could edit their own room's numbers. That is acceptable for two friends. It would need a server before coins are worth
anything to strangers, and the Stage 4 economy is designed with that in mind.

## Testing without Firebase

Opening the game as `index.html?mock=1` through a local server swaps in a small local stand-in for Firebase, stored in
the browser, where each tab is a separate player. It is a developer aid: it does not check the security rules and is not
used for real play.

## Files

```
index.html
css/style.css
firebase/database.rules.json   security rules to paste into Firebase
js/firebase-config.js           your project settings
js/firebase.js                  sign-in, database handle, shared clock
js/multiplayer.js               rooms, presence, listeners, publishing
js/sync.js                      leader / follower logic
js/lobby.js                     create / join screen and status bar
js/sprites.js  js/world.js  js/effects.js  js/pets.js  js/game-engine.js  js/main.js
js/mock-firebase.js             local test stand-in (only with ?mock=1)
```

## Roadmap

4. Coins earned from the cats' happiness, shop (furniture, food, toys, clothes), inventory, activity history.
5. Audio, mobile polish, deployment guide.
