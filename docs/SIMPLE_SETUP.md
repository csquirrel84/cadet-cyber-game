# How to get the game running

Follow these steps in order. Don't skip any.

## What you need before you start

- A Windows laptop.
- A small WiFi router (the cheap kind you can buy online, under £20).
  You need this because the game's laptop can't always make its own
  WiFi. **Do not use a router you don't own without asking someone.**
- An internet connection, just for today's setup (not needed on the day
  of the game).

## Step 1: Get the game files

1. Open your web browser.
2. Go to this address: `github.com/csquirrel84/cadet-cyber-game`
3. Look for a green button that says **Code**. Click it.
4. Click **Download ZIP**.
5. Find the file you just downloaded (it's usually in a folder called
   **Downloads**). It will be called `cadet-cyber-game-main.zip`.
6. Right-click that file. Click **Extract All...**.
7. Click **Extract**. A new folder appears.

## Step 2: Run the setup

1. Open the new folder from Step 1.
2. Find the file called `setup.ps1`.
3. Right-click it.
4. Click **Run with PowerShell**.
5. A black window opens. It will ask you a question:
   "How many teams should this run?"
   - If you have several teams, each on their own laptop, type the
     number of teams (for example `4`) and press Enter.
   - If it's just going to be one game on one screen (like a TV or
     projector), type `0` and press Enter.
6. **Leave it alone and let it work.** This can take a long time (up to
   30 minutes) the first time. Don't close the window.
7. If a blue box appears asking "Do you want to allow this app..." click
   **Yes**.
8. If the window says the game is already blocked by a security
   setting, do this instead:
   - Right-click `setup.ps1` again.
   - This time, holding down **Shift**, right-click inside the folder
     and choose **Open PowerShell window here**.
   - Type this and press Enter: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
   - Type `Y` and press Enter if it asks.
   - Type `.\setup.ps1` and press Enter.
9. Wait. When it's finished, you'll see a list of web addresses, like
   `http://192.168.137.1:8000/`. **Don't close this window** — closing
   it does not stop the game, but keep it somewhere safe so you can read
   those addresses later.

## Step 3: Set up the router

1. Plug the little router into a power socket.
2. Connect the router to your laptop using a cable (comes with the
   router) — plug one end into the laptop, the other into the router.
   If your laptop has no cable socket, connect to the router's own WiFi
   network instead (its name and password are usually printed on a
   sticker on the router).
3. Wait about a minute for the lights on the router to settle down.

## Step 4: Write down the addresses

1. Go back to the black window from Step 2.
2. You'll see ten lines like this:
   ```
   alpha      http://192.168.137.1:8000/
   bravo      http://192.168.137.1:8001/
   ```
3. Each line is for one team. Write each address on a separate card,
   one per team — these are what the cadets will type into their own
   laptops.
4. You'll also see ten more lines starting `http://127.0.0.1:` — these
   are only for you, the adult running the session. Keep these private;
   don't give them to any team.

## Step 5: On the day

1. Turn on the router (Step 3 again, if you packed it away).
2. Each team's laptop connects to the router's WiFi (same name/password
   as Step 3).
3. Each team types their own address from their card into their own web
   browser.
4. You open your own addresses (the `127.0.0.1` ones) to watch and
   control each team from your own laptop.

## When it's all over

1. Go back to the black window (or open a new one in the same folder:
   Shift + right-click the folder, **Open PowerShell window here**).
2. Type `.\teardown.ps1` and press Enter.
3. Wait for it to finish, then you can close everything and pack away
   the router.

## If something goes wrong

Don't guess — write down exactly what you see on the screen (a photo
on your phone is fine) and ask for help. Don't try to fix it yourself
by closing windows or restarting the laptop; that can make it harder to
work out what happened.
