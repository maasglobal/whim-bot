'use strict';
/**
 * Whim-Bot main handler
 * @author Sami Pippuri <sami.pippuri@maas.global>
 * @author Ville Rantala <ville.rantala@microsoft.com>
 * LICENSE: MIT
 */

const builder = require('botbuilder');
const requests = require('./requests.js');
const utils = require('./utils');
const _ = require('lodash');

const FRONTEND_URL = process.env.BOT_FRONTEND_URL || 'https://localhost:3000';
const FIRST_FACTOR_URL = FRONTEND_URL + '/index.html';
const SECOND_FACTOR_URL = FRONTEND_URL + '/factor2.html';
const MIN_LOCATION_CHARS = 3;

if (!process.env.WHIM_API_KEY) {
  console.log('ERROR: Environment doesnt seem to be properly set');
}
const connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});

const bot = new builder.UniversalBot(connector);
const listener = connector.listen();
const intents = new builder.IntentDialog();

intents.matches('cancel', '/cancel');
intents.matches('quit', '/cancel');
intents.matches('exit', '/cancel');
intents.matches('help', '/help');
intents.matches('hi', '/help');
intents.matches('hi!', '/help');
intents.matches('hello', '/help');

const fetchProfileFavorites = token => {
  return new Promise( (resolve, reject) => {
    return requests.favorites(token)
      .then( (res) => {
      console.log('Got favorites', res);
      const arr = {};
      for (const item of res.profile.favoriteLocations) {
        arr[item.name] = {
          latitude: item.lat,
          longitude: item.lon,
          name: item.name
        };
      }
      return resolve(arr);
    });
  });
}

bot.dialog('/', intents);

bot.dialog('/persistUserData', function (session, data) {
  session.userData.user = data;
  session.endDialog();
});

bot.dialog('/cancel', session => {
  session.endConversation();
});

bot.dialog('/help', session => {
  session.send('Hi, this is the Whim Bot. First, type a location or send your current location via the Messenger app (+) menu. Then the Whim Bot will walk you through the process of selecting the destination location, and planning the trip to the destination.')
  session.endDialog('Where is your starting point?')
});

const handleAccountLinking = session => {
  console.log('handleAccountLinking', session);
  const accountLinking = session.message.sourceEvent.account_linking;
  // This is the handling for the `Account Linking webhook event` where we could
  // verify the authorization_code and that the linking was successful.
  // The authorization_code is the value we passed above and
  // status has value `linked` in case the linking succeeded.
  const username = accountLinking.authorization_code;
  const authorizationStatus = accountLinking.status;
  if (authorizationStatus === 'linked') {
    session.beginDialog('/help');
  } else if (authorizationStatus === 'unlinked') {
    // Remove user from the userData
    delete session.userData.user;
    session.endDialog('Account unlinked');
  } else {
    session.endDialog('Unknown account linking event received');
  }
};

intents.onDefault( session => {
  console.log('OnDefault', session.message);
  if (session.message.source === 'facebook') {
    if (session.message.sourceEvent.account_linking) {
      handleAccountLinking(session);
      return;
    }
    const storedUser = session.userData.user;
    if (!storedUser) {
      session.beginDialog('/welcome');
      return;
    }
    const entities = session.message.entities;
    console.log('Entities received are', entities);

    if (entities.length > 0 && entities[0].geo) {
      const geo = Object.assign({name: 'Pin Location'}, entities[0].geo)
      session.beginDialog('/options', geo);
      return;
    }
    if (session.message.text && session.message.text.length >= MIN_LOCATION_CHARS) {
      // TODO recognize natural language
      if (['quit','exit','cancel','hello','hi','hi!','yo','yo!','help','help!']
            .indexOf(session.message.text.toLowerCase()) !== -1) {
        console.log('Help wanted');
        return session.beginDialog('/help');
      }
      console.log('Searching for a place ', session.message.text)
      session.sendTyping();
      return session.beginDialog('/geosearch', session.message.text);
    }
    return session.beginDialog('/help'); //('To request a ride, please send your location');
  } else {
    session.endDialog('I am currently expecting to be called from Facebook Messenger');
  }
});

bot.dialog('/welcome', function (session) {
  console.log('Welcome presented as', FIRST_FACTOR_URL + '?address=' + JSON.stringify(session.message.address))
  var message = new builder.Message(session)
    .sourceEvent({
      facebook: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [{
              title: 'Welcome to Whim Bot',
              subtitle: 'Please log in with your Whim account',
              image_url: process.env.LOGO_URL || 'http://whimapp.com/wp-content/uploads/2017/03/whim.jpg',
              buttons: [{
                type: 'account_link',
                url: FIRST_FACTOR_URL + '?address=' + JSON.stringify(session.message.address)
              }]
            }]
          }
        }
      }
    });
  session.endDialog(message);
});

bot.dialog('/geosearch', [
  (session, text) => {
    requests.geocode(text, 60.169, 24.938, session.userData.user.id_token).then( (results) => {
        const location = utils.filterGeoCollection(results);
        console.log('Results from search are', results, 'filtered as', location);
        if (!location) return Promise.reject('Could not find location');
        const googleURL = `https://maps.googleapis.com/maps/api/staticmap?center=${location.latitude},${location.longitude}&size=300x300&zoom=12&markers=${location.latitude},${location.longitude}`
        console.log('Requesting a static map from', googleURL);
        const message = new builder.Message(session)
            .sourceEvent({
              facebook: {
                attachment: {
                  type: 'template',
                  payload: {
                    template_type: 'generic',
                    elements: [{
                      title: location.name,
                      image_url: googleURL,
                    }]
                  }
                }
              }
            });
    
        session.send(message);
        
        session.dialogData.location = location;
        builder.Prompts.choice(session,
          `Use ${location.name} as starting point?`,
          {
            OK: session.dialogData.location,
            Retry: {},
          },
          {
            maxRetries: 0
          });
      })
      .catch( err => {
        session.endDialog('Could not find that location');
      } );
  },
  (session, options) => {
    if (!options.response) {
      return session.endDialog('Please make a selection');
    }
    if (options.response.index !== 0) {
      return session.endDialog('Ok, please specify a location again.')
    }
    // TODO send the location as a GEO object in the mean time
    session.beginDialog('/options', session.dialogData.location);
  }
]);

bot.dialog('/options', [(session, fromLocation) => {
  session.dialogData.fromLocation = fromLocation;
  session.dialogData.choices = {
    Routes: {

    },
    'Whim Car': {

    },
    Restaurants: {

    },
  };
  builder.Prompts.choice(
      session,
      `Select what to search from ${fromLocation.name}, or type something else like 'italian' or 'indian'`,
      session.dialogData.choices,
      {
        maxRetries: 0
      }
    );
},
(session, options) => {
  console.log('options were', options.response, 'and message', session.message.text);
  const param = session.dialogData.fromLocation;
  if (options.response) {
    param.kind = options.response.entity;
    switch (options.response.index) {
      case 0:
        return session.beginDialog('/location', param); 
      case 1:
        console.log('Whim Car selected');
        return session.beginDialog('/whimcar', session.dialogData.fromLocation); 
      case 2:
        console.log('Moving to /food to search for', param);
        return session.beginDialog('/food', param); 
      default:
        return session.replaceDialog('/options', param); 
    }
  } else if(['quit','stop','cancel','help'].indexOf(session.message.text) != -1) {
      return session.endDialog('Ok, start over by sending a location.');
  } else {
    param.kind =  session.message.text;
    console.log('Moving to /food to search for', param);
    return session.beginDialog('/food', param); 
  }
}
]);

bot.dialog('/whimcar', [
  (session, toLocation) => {
    session.dialogData.toLocation = toLocation;
    return session.endDialog(`Sorry, Whim Car isn't yet implemented`);
  }
]);

const kFormatter = num => {
    return num > 999 ? (num/1000).toFixed(1) + 'k' : Math.floor(num) + 'm'
}
const nearestBusiness = items => {
  if (!items || items.length === 0) return null;
  const furthest = _.maxBy(items, item => item.distance );
  const distanceScore = furthest.distance % 100;
  items.map( item => {
    const rating = item.rating ? item.rating : 2.5;
    item.score = ((rating * 100) - (item.distance / distanceScore));
  });
  const max = _.maxBy(items, item => item.score);
  return max;
}

const randomBusiness = items => {
  if (!items || items.length === 0) return null;
  const rand = Math.floor(Math.random() * 100) % items.length;
  const choice = items[rand];
  return choice;
}

const sendYelp = (session, choice, kind) => {
  if (!choice.rating) {
    choice.rating = '-';
  }
  if (!choice.price) {
    choice.price = '-';
  }
  const message = new builder.Message(session)
        .sourceEvent({
          facebook: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'generic',
                elements: [{
                  title: `${kind}: ${choice.name}`,
                  subtitle: `${choice.price} - ${choice.rating} Yelp rating - ${kFormatter(choice.distance)} away`,
                  image_url: choice.image_url,
                  buttons: [{
                    type: 'web_url',
                    url: choice.url,
                    title: 'Visit Yelp Site'
                  }]
                }]
              }
            }
          }
        });

    session.send(message);
}

bot.dialog('/food', [
  (session, location) => {
    const kind = location.kind;
    console.log(kind, 'for location', location);
    if (!location) {
      return session.endDialog('Need to specify a location');
    }
    session.dialogData.fromLocation = location;
    requests.places(kind, location.latitude, location.longitude).then( (results) => {
      if (!results.businesses || results.businesses.length < 1 ) {
        return session.endDialog(`Did not find those in ${location.name}. Please try another place.`);
      }
      const choices = {};
      const nearest = nearestBusiness(results.businesses);
      const choice = randomBusiness(results.businesses);
      sendYelp(session, choice, 'Random Pick');
      sendYelp(session, nearest, 'Best');
      choices[`${choice.name}`] = choice;
      choices[`${nearest.name}`] = nearest;
      choices['Try again!'] = {};
      session.dialogData.choices = choices;
      builder.Prompts.choice(
          session,
          'Please select one of the options:',
          choices,
          {
            maxRetries: 0
          }
      );
    })
    .catch( err => {
      return session.endDialog('Error searching, try again.');
    });
  },
  (session, options) => {
    console.log('Selection was', options);
    if (options.response && options.response.index >= 0 && options.response.index < 2) {
      const choice = session.dialogData.choices[options.response.entity];
      const coords = Object.assign( { name: choice.name }, choice.coordinates);
      const fromLocation = session.dialogData.fromLocation;
      fromLocation.toLocation = coords;
      return session.beginDialog('/location', fromLocation );     
    } 
    if (options.response && options.response.index === 2) {
      return session.replaceDialog('/food', session.dialogData.fromLocation);     
    } 
    if (session.message.text === 'help' || session.message.text === 'quit') {
      return session.replaceDialog('/help');
    }
    session.send('Ok, what else would you like to look from?');     
    return session.replaceDialog('/options', session.dialogData.fromLocation);     
  }
])

bot.dialog('/location', [
  function (session, fromLocation) {
    session.dialogData.fromLocation = fromLocation;
    console.log('fromLocation', fromLocation);
    //session.send(`Planning a route from ${fromLocation.name}`);
    session.sendTyping();
    if (fromLocation && fromLocation.toLocation) {
        return session.beginDialog('/destination', fromLocation);
    }
    fetchProfileFavorites(session.userData.user.id_token)
      .then( favorites => {
        console.log('Profile info', favorites);
        session.beginDialog('/destination', favorites);
      })
      .catch( err => {
        console.log('Error fetching profile', err);
        session.endDialog('Had an error while fetching favorites');
      });
  },
  function (session, results) {
    console.log('User choice for to-location', results)
    if (results.response) {
      var toLocation = results.response;
      session.dialogData.toLocation = toLocation;
      var fromLocation = session.dialogData.fromLocation;
      session.send(`Searching for routes from ${fromLocation.name} to ${toLocation.name}`);
      session.sendTyping();
      requests.routes(
        fromLocation, toLocation,
        session.userData.user.id_token).then( response => {
          session.dialogData.taxiPlan = utils.filterTaxi(response.plan.itineraries);
          session.dialogData.ptPlan = utils.filterPT(response.plan.itineraries);
          if (!session.dialogData.ptPlan && !session.dialogData.taxiPlan) {
            return session.endDialog(`Did not find routes to ${toLocation.name}`);
          }
          session.send('Found ' + response.plan.itineraries.length + ' routes');
          const topItin = session.dialogData.ptPlan;
          console.log('Itinerary', topItin);
          const choices = {};
          if (topItin) {
            choices['Public Transport'] = {};
            session.send(`Public Transport ${topItin.fare.points}p, ${utils.calcDuration(topItin)}`);
          }
          if (session.dialogData.taxiPlan) {
            choices['TAXI'] = {};
            session.send(`Or TAXI ${session.dialogData.taxiPlan.fare.points}p, ${utils.calcDuration(session.dialogData.taxiPlan)}`);
          }
          choices.Cancel = {};
          builder.Prompts.choice(
            session,
            `Book a ride to ${toLocation.name}?`,
            choices,
            {
              maxRetries: 0
            }
          );
        }
      );
    }
  },
  function (session, results) {
    if (results.response) {
      console.log('Response to the session is', results);
      let plan = null;
      switch (results.response.entity) {
        case 'Public Transport':
          plan = session.dialogData.ptPlan;
          break;
        case 'TAXI':
          plan = session.dialogData.taxiPlan;
          break;
        case 2:
        default:
          return session.endDialog('Ok - please send a new place');
      }
      if(plan) {
        return requests.book(plan, session.userData.user.id_token).then( res => {
          return session.endDialog('Your ride is booked - check your Whim-app!');
        })
        .catch( err => {
            console.log('ERROR booking trip', err);
            return session.endDialog('Error booking your trip');
        });
      }
    } 
    return session.endDialog('Ok. Please throw an another challenge!');
  },
]);


bot.dialog('/destination', [
  function (session, choices) {
    session.dialogData.choices = choices;
    if (choices.toLocation) {
      console.log('destination had toLocation', choices.toLocation);
      return session.endDialogWithResult({
        response: choices.toLocation
      });
    }
    builder.Prompts.choice(
      session,
      'Choose or send location to set the destination',
      choices,
      {
        maxRetries: 0
      }
    );
  },
  function (session, results) {
    console.log('Destination response', results);
    if (results.response && results.response.entity) {
      var choices = session.dialogData.choices;
      session.endDialogWithResult({
        response: choices[results.response.entity]
      });
    } else if (session.message.entities.length > 0 && session.message.entities[0].geo) {
      const geo = Object.assign({ name: 'Pin Location' }, session.message.entities[0].geo);
      session.endDialogWithResult({
        response: geo
      });
    } else if (session.message.text && session.message.text.length >= MIN_LOCATION_CHARS) {
      console.log('Searching for a place ', session.message.text)
      session.sendTyping();
      return requests.geocode(session.message.text, 60.169, 24.938, session.userData.user.id_token).then( (results) => {
        console.log('Results from search are', results);
        const location = utils.filterGeoCollection(results);
        if (!location) {
          console.log('ERROR', err);
          session.send('Did not understand the sent location - please try again');
          session.replaceDialog('/destination', session.dialogData.choices);
        } else {
          session.dialogData.location = location;
          const googleURL = `https://maps.googleapis.com/maps/api/staticmap?center=${location.latitude},${location.longitude}&size=300x300&zoom=12&markers=${location.latitude},${location.longitude}`
          console.log('Requesting a static map from', googleURL);
          const message = new builder.Message(session)
              .sourceEvent({
                facebook: {
                  attachment: {
                    type: 'template',
                    payload: {
                      template_type: 'generic',
                      elements: [{
                        title: location.name,
                        image_url: googleURL,
                      }]
                    }
                  }
                }
              });
      
          session.send(message);
                    
          builder.Prompts.choice(session,
            `Use ${location.name} as destination?`,
            {
              OK: session.dialogData.location,
              retry: {},
            },
            {
              maxRetries: 0
            });
        }
      });
    } else {
      session.send('Did not understand the sent location - please try again');
      session.replaceDialog('/destination', session.dialogData.choices);
    }
  },
  (session, options) => {
    if (!options.response) {
      return session.replaceDialog('/destination', session.dialogData.choices);
    }
    if (options.response.index !== 0) {
      return session.endDialog('Ok, please specify a location again.')
    }
   return session.endDialogWithResult({
     response: session.dialogData.location
    });
  }
]);

bot.dialog('/logout', function (session) {
  requests.unlink(session.message.address.user.id).then(response => {
      session.endDialog();
    })
    .catch( () => {
      session.endDialog('Error while unlinking account');
    });
});

// Mapping between the action `logout` (defined in `persistent-menu.json`)
// and the /logout dialog defined above.
bot.beginDialogAction('logout', '/logout');

/**
 * Login flow with FB account linking
 * 
 */

const runFactors = (event, context, callback) => {
  if (!event.queryStringParameters) {
    return Promise.resolve( { statusCode: 403, body: 'Expected something else'} );
  }
  const redirect = event.queryStringParameters['redirect_uri'];
  const address = event.queryStringParameters['address'];
  const token = event.queryStringParameters['account_linking_token'];
  var phone = event.queryStringParameters['phone'];
  const path = event.path;

  if (path === '/factor2') {
    phone = `+${unescape(phone)}`;
    let code = event.queryStringParameters['code'];
    console.log('Logging in with', phone, code)
    return requests.login(phone, code)
      .then( (response) => {
      const retVal = {
        statusCode: 301,
        body: '',
        headers: {
          'Content-Type': 'text/html',
          Location: `${FIRST_FACTOR_URL}?${utils.concatenateQueryString(event.queryStringParameters)}`
        }
      };
      var address = JSON.parse(event.queryStringParameters.address);
      return new Promise( (resolve, reject) => {
        bot.beginDialog(address, '/persistUserData', response, (error, resp) => {
          if (error) {
            console.log('ERROR: Redirecting to', retVal.headers.Location);
            return reject(retVal);
          }
          console.log('SUCCESS: Redirecting to', retVal.headers.Location);
          retVal.Location = `${redirect}&authorization_code=${phone.replace('+', '')}`;
          return resolve(retVal);
        });
      });
    });
  } else if (path === '/factor1') {
   
    phone = unescape(phone);
    console.log('requesting code for', phone)

    return requests.requestCode(phone)
      .then( (response, body) => {
      const retVal = {
        statusCode: 301,
        body: '',
      };
      
      //res.redirect(SECOND_FACTOR_URL + '?' + queryString + '&phone=' + phone , next);
      retVal.headers = {
        Location: `${SECOND_FACTOR_URL}?${utils.concatenateQueryString(event.queryStringParameters)}`
      }
      console.log('Redirecting to', retVal.headers);
      retVal.body = '';
      return retVal;
    })
    .catch( err => {
      return {
        statusCode: 301, 
        headers: {
          Location: `${FIRST_FACTOR_URL}?${utils.concatenateQueryString(event.queryStringParameters)}`
        }  
      }
    });

  } else {
    return Promise.reject({ statusCode: 404 });
  }
};

/**
 * Handler functions exported from the module
 */

// 1st and 2nd factor auth
module.exports.factors = (event, context, callback) => {
  console.log('factors', event);
  runFactors(event, context)
    .then( res => callback(null, res) )
    .catch( err => callback(null, err) );
}

// restify mock for lambda
module.exports.listener = (event, context, callback) => {
  console.log('Mock Listener handler called with event', event);
  const mock = require('./serverless.js')(listener);
  return mock.post(event, context, callback);
}
