const fs = require('fs');
const querystring = require('querystring');
const axios = require('axios');
const express = require('express');
const FileStore = require('fs-store').FileStore;
const moment = require('moment');

require('dotenv').config();
const store = new FileStore('data.json');

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const PLUGIN = process.env.PLUGIN;
const PORT = process.env.PORT || 8889;
const REDIRECT = `http://localhost:${PORT}/callback`;
const ERRORS = true;
const scopes = 'offline_access calendars.read';

const app = express();
app.listen(PORT);
console.log(`Listening on ${PORT}`);

let ACCESS, REFRESH;
REFRESH = store.get('microsoftRefresh');

// setIntervalImmediately(() => {
getEvents();
// }, 5000);

app.get('/', (req, res) => {
  getEvents(res);
});

app.get('/login', (req, res) => {
  res.redirect('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scopes,
      redirect_uri: REDIRECT
    })
  );
});

app.get('/callback', (req, res) => {
  console.log(req.query);
  const code = req.query.code || null;

  const data = {
    code: code,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
    scope: scopes,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };

  axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    REFRESH = response.data.refresh_token;
    store.set('microsoftRefresh', REFRESH);

    if (res) res.redirect('/');
  }).catch(err => {
    if (ERRORS) console.error(err.response);
    const info = 'Error getting access token from authorization code'
    res.status(500).send(info);
    updatePlugin(info);
  });
});

function getAccess(res, cb) {
  const data = {
    grant_type: 'refresh_token',
    refresh_token: REFRESH,
    scope: scopes,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };
  axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    if (res) res.redirect('/');
    if (cb) cb();
  }).catch(err => {
    if (ERRORS) console.error(err.response);
    const info = 'Error getting access token from refresh token';
    if (res) res.status(500).send(info);
    updatePlugin(info);
  })
}

function getEvents(res) {
  if (ACCESS) {
    if (res) res.send('TODO');

    axios.get('https://graph.microsoft.com/v1.0/me/calendars', {
      headers: {
        Authorization: 'Bearer ' + ACCESS
      }
    }).then(response => {
      const startWeek = moment().startOf('week');
      const endWeek = moment().endOf('week');

      const data = {
        startdatetime: startWeek.format(),
        enddatetime: endWeek.format(),
        $top: 50, // 50 items per page
      };

      let p = response.data.value.map(calendar => {
        return axios.get(`https://graph.microsoft.com/v1.0/me/calendars/${calendar.id}/calendarview?` + querystring.stringify(data), {
          headers: {
            Authorization: 'Bearer ' + ACCESS,
            Prefer: 'outlook.timezone="Pacific Standard Time"'
          }
        });
      });

      axios.all(p).then(data => {
        let events = [];
        data.forEach(c => {
          c.data.value.forEach(e => {
            events.push({
              ...e,
              start: moment(e.start.dateTime),
              end: moment(e.end.dateTime)
            });
          });
        });

        // Sort and filter results
        events = events.sort((a, b) => {
          return a.start - b.start
        }).filter(e => e.showAs === 'busy');

        const info = events[0].subject + ' - ' + events[0].start.calendar()
        updatePlugin(info, events);
      }).catch(err => {
        if (ERRORS) console.error(err.response);
        const info = 'Couldn\'t get upcoming events';
        updatePlugin(info);
        if (res) res.status(500).send(info);
      })
    }).catch(err => {
      console.error(err.response);
    });
  } else if (REFRESH) {
    console.log('Getting access token');
    getAccess(res, () => getEvents());
  } else {
    if (res) res.redirect('/login');
    const info = `Not logged in, please visit http://localhost:${PORT}`;
    updatePlugin(info);
  }
}

function updatePlugin(info, data) {
  console.log(info);

  try {
    switch (PLUGIN) {
      case 'genmon':
        let file;
        if (data) {
          file = `<img>${__dirname}/icons/calendar.png</img><txt> ${info}</txt><tool>${data}</tool>`;
        } else {
          file = info;
        }
        // Fix issues with & character
        file = file.replace(/&/g,'+');

        fs.writeFileSync('./outlook', file);
        break;
      default:
        console.log(info);
        break;
    }
  } catch (err) {
    if (ERRORS) console.error(err);
  }
}

function setIntervalImmediately(func, interval) {
  func();
  return setInterval(func, interval);
}