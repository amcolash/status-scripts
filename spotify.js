const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const axios = require('axios');
const express = require('express');
const FileStore = require('fs-store').FileStore;

if (!fs.existsSync(path.resolve(__dirname, '.env'))) {
  console.error('.env file missing, please make one!');
  process.exit(1);
}

require('dotenv').config({path: path.resolve(__dirname, '.env')});
const store = new FileStore(path.resolve(__dirname, 'data/spotify_token.json'));

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PLUGIN = process.env.PLUGIN;
const PORT = process.env.PORT || 8888;
const REDIRECT = `http://localhost:${PORT}/callback`;
const ERRORS = true;

const app = express();
app.listen(PORT);
console.log(`Listening on ${PORT}`);

let ACCESS, REFRESH;
REFRESH = store.get('spotifyRefresh');

setIntervalImmediately(() => {
  getNowPlaying();
}, 5000);

app.get('/', (req, res) => {
  getNowPlaying(res);
});

app.get('/login', (req, res) => {
  var scope = 'user-read-playback-state user-modify-playback-state';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT,
    })
  );
});

app.get('/callback', (req, res) => {
  const code = req.query.code || null;

  const data = {
    code: code,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };

  axios.post('https://accounts.spotify.com/api/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    REFRESH = response.data.refresh_token;
    store.set('spotifyRefresh', REFRESH);

    res.redirect('/');
  }).catch(err => {
    if (ERRORS) console.error(err.response || err);
    const info = 'Error getting access token from authorization code'
    res.status(500).send(info);
    updatePlugin(info);
  });
});

function getAccess(res, cb) {
  const data = {
    grant_type: 'refresh_token',
    refresh_token: REFRESH,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };
  axios.post('https://accounts.spotify.com/api/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    if (res) res.redirect('/');
    else if (cb) cb();
  }).catch(err => {
    if (ERRORS) console.error(err.response || err);
    const info = 'Error getting access token from refresh token';
    if (res) res.status(500).send(info);
    updatePlugin(info);
  })
}

function getNowPlaying(res) {
  if (ACCESS) {
    axios.get('https://api.spotify.com/v1/me/player', {
      headers: {
        Authorization: 'Bearer ' + ACCESS
      }
    }).then(response => {
      const data =  response.data;
      const info = data.is_playing ? `${data.item.name} - ${data.item.artists[0].name}` : 'Nothing currently playing';
      updatePlugin(info, data || {});
      if (res) res.send(`You're all set to go!<br>Currently Playing: ${info}`);
    }).catch(err => {
      // Refresh token when expired
      if (err.response && err.response.status === 401) {
        console.log('Refreshing access token');
        getAccess(res, () => getNowPlaying());
      } else {
        if (ERRORS) console.error(err.response || err);
        const info = 'Couldn\'t get currently playing data';
        updatePlugin(info);
        if (res) res.status(500).send(info);
      }
    });
  } else if (REFRESH) {
    console.log('Getting access token');
    getAccess(res, () => getNowPlaying());
  } else {
    if (res) res.redirect('/login');
    const info = `Not logged in, please visit http://localhost:${PORT}`;
    updatePlugin(info);
  }
}

function updatePlugin(info, data) {
  try {
    switch (PLUGIN) {
      case 'genmon':
        let file;
        if (data && data.is_playing) {
          file = `<img>${__dirname}/icons/spotify.png</img><txt>  ${info}</txt><tool>Spotify playing on ${data.device.name}\n${info}</tool>`;
        } else if (data) {
          file = `<img>${__dirname}/icons/spotify_disabled.png</img><txt> </txt><tool>Nothing Currently Playing</tool>`;
        } else {
          file = info;
        }
        // Fix issues with & character
        file = file.replace(/&/g,'+');

        fs.writeFileSync(path.resolve(__dirname, 'data/spotify'), file);
        break;
      default:
        console.log(info);
        fs.writeFileSync(path.resolve(__dirname, 'data/spotify'), info);
        break;
    }
  } catch (err) {
    if (ERRORS) console.error(err.response || err);
  }
}

function setIntervalImmediately(func, interval) {
  func();
  return setInterval(func, interval);
}
