# maas-bot

## Motivation
I couldn't find a _simple_ webpack starter template that contained all the features I wanted.

I've put together this simple webpack starter example with the following features:

* Hot loading of react components
* Proxying onto your own api server (in `server/index.js`) for api calls
* Auto reload of api server on server file changes
* Sourcemaps during developement
* Sourcemaps for production builds for debugging deployed code
* Babel for js/jsx processing
* Imagemin for processing images
* Font handling
* scss/sass with autoprefixer
* Testing

## Getting started
Clone the repository:

```sh
git clone git@github.com:cgreening/simple-webpack-react-starter.git
cd simple-webpack-react-starter
npm install
npm run dev
Browse to http://localhost:8080
```
If you just want to start a new project without all the commit history then do:

```sh
git clone --depth=1 git@github.com:cgreening/simple-webpack-react-starter <your-project-name>
cd <your-project-name>
npm install
npm run dev
Browse to http://localhost:8080
```

__Special note for windows users__

`npm run dev` relies on being able to run two commands simultaneously, the server and the webpack dev server. This does not work on windows so you will need to open to command windows and run these commands:

```sh
npm run dev-web
```

```sh
npm run dev-server
```

You can now browse to `http://localhost:8080`

##Live Reload

In `App` you'll find the single page reach app. Try opening `Components/Header.js' and modifying the text. Hit save and the browser should update with your changes.

In `Server` you'll find a minimal express server. Currently it serves content from the build directory and has 1 api call to get the current time.

Try adding a new api endpoint and modify `Components/Content.js` so that it hits your new endpoint.

You should be able to make all these changes without restarting the server manually as it should auto detect the changes and restart/reload as necessary.

## Running in Development Mode
```sh
npm run dev
```
This will start the webpack dev server on the defuault port (8080). It will also start the express server from `server/index.js` using nodemon.

Webpack dev server will watch for changes in the files from the `App` folder and hot load any changed modules.

nodemon will watch files in the `server` folder and restart the express server if any files change.

This means that you can update both your single page app and your backend during development and have the changes available immediately.

## Building for Production
```sh
npm run build
```
This will build the app and output the files to the `build` directory.
## Running the server
```sh
npm run start
```
This will launch the express server serving content from `build`

## Testing
Testing is done using karma + mocha with sinon for stubbing ajax requests. We use the [karma-webpack preprocessor](https://github.com/webpack/karma-webpack)

The karma config lives in `karma.conf.js` and is setup to run tests in Chrome and load up `tests.webpack.js`

`tests.webpack.js` loads up all the tests from the `tests` directory and bundles them all up using webpack. We then run them all at once.

To do a test run:

```sh
npm test
```

And to run continuous tests which rerun everytime a file changes:

```sh
npm run testing
```


## What could be done better

* duplicated code in the web pack config files

There is a lot of duplication between the two webpack config files - this is deliberate as I wanted it to be a as clear as possible what is happening. I have refactored the obviously common stuff like loaders and the index page generation into `webpack-common.config.js`

* probably a lot of other things - open a pull request!

## Deploy to Heroku
Try out the code on heroku:

[![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy)
