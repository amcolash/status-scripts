# status-scripts
Scripts to provide status of various things in a terminal output, good for [i3-status](https://i3wm.org/i3status/) / [xfce4-genmon-plugin](https://goodies.xfce.org/projects/panel-plugins/xfce4-genmon-plugin).

## Spotify
This small node script provides the status of the currently playing song in Spotify using the new Player API. This means that it will even show the currently playing song from your phone!

## Outlook
This small node script provides the status for upcoming events in your outlook 365 calendars. A hover on the genmon item provides a list of items for that day.

---------------------

## Getting Started
You will need to make an app for spotify/microsoft graph as desired.

Once that is done, check out the repo `git clone https://github.com/amcolash/status-scripts.git`.
Install node (if needed) and then install dependencies with `npm install`.

You will need to make a `.env` file in the root of the checked out repo. It's contents should have your custom app client id/secret. Here is a sample.
```
SPOTIFY_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SPOTIFY_CLIENT_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

MICROSOFT_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
MICROSOFT_CLIENT_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

PLUGIN=genmon
```

Install `pm2` to daemonize the script `npm install pm2 -g`. Set it up as a service `pm2 startup` and follow directions.

Finally, you can daemonize one of the scripts with `pm2 spotify.js && pm2 save` or `node outlook.js && pm2 save`.

If you are using genmon, just set your script as `cat [path to repo]/data/spotify` or `cat [path to repo]/data/outlook`. I suggest setting the update interval to 1 second. Genmon doesn't poll the apis every second, just prints out the output of the file. The refresh rate is controlled in the script itself).

## Attribution for Icons
Spotify icon from [Spotify](https://developer.spotify.com/branding-guidelines/) and calendar icon from [IconFinder](https://www.iconfinder.com/icons/285670/calendar_icon).