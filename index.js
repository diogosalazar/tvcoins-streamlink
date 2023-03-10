#!/usr/bin/env node

const { firefox } = require('playwright');
const { program } = require('commander');

const DEFAULT_TIMEOUT = 5000

async function getStreamLink(tvCoinsPlayerUrl, timeout=DEFAULT_TIMEOUT) {
  try {
    // Create a new URL object
    const url = new URL(tvCoinsPlayerUrl);

    // Check if the autoplay parameter is already present in the URL
    if (!url.searchParams.has('autoplay')) {
      // Add the autoplay parameter to the URL
      url.searchParams.append('autoplay', 'true');
    }

    // Get the modified URL string
    tvCoinsPlayerUrl = url.toString();
  } catch (error) {
    throw new Error('Invalid URL: ' + tvCoinsPlayerUrl);
  }

  const browser = await firefox.launch({
    headless: true
  });
  const context = await browser.newContext();

  // Create a promise that resolves when the "index.mpd" file is intercepted
  const mpdInterceptedPromise = new Promise(resolve => {
    context.on('request', request => {
      const requestUrl = request.url()
      if (requestUrl.endsWith('/index.mpd')) {
        resolve(requestUrl)
      }
    });
  });

  const page = await context.newPage();
  await page.goto(tvCoinsPlayerUrl);

  await page.waitForLoadState('domcontentloaded')

  let streamLink = null
  try {
    // Wait for the "index.mpd" file to be intercepted or time out after some time
    const timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Timed out waiting for "index.mpd" file')), timeout)
    })
    streamLink = await Promise.race([mpdInterceptedPromise, timeoutPromise])
  } catch (err) {
    throw new Error('Unable to get stream link: ' + err.message);
  } finally {
    // Close the browser when finished
    await browser.close();
  }

  return streamLink
}

program
  .arguments('[url]')
  .description('Get the stream link for a given TVCoins URL')
  .option('-t, --timeout <timeout>', 'Timeout in milliseconds', DEFAULT_TIMEOUT)
  .action(async (url, { timeout = DEFAULT_TIMEOUT }) => {
    if (!url || url === '-') {
      // If the url argument is not provided, read it from stdin
      url = await new Promise((resolve, reject) => {
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', data => {
          resolve(data.trim());
        });
        process.stdin.on('error', err => {
          reject(err);
        });
      });
    }

    try {
      const streamLink = await getStreamLink(url, timeout);
      console.log(streamLink);
      process.exit(0); // exit with zero code on success
    } catch (error) {
      console.error(error.message);
      process.exit(1); // exit with non-zero code on error
    }
  });

program.parse(process.argv);
