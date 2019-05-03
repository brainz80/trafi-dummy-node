const _ = require('lodash');

const bodyParser = require('body-parser');
const parser = require('fast-xml-parser');
const sseExpress = require('sse-express');
const chokidar = require('chokidar');
const iconv = require('iconv-lite');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const HOST = '0.0.0.0';
const PORT = 8080;

const ResultsCollector = require('./src/ResultsCollector.js');

const RESPONSE_PATH = path.resolve('./responses');
const NO_RESPONSE = `<?xml version="1.0" encoding="ISO-8859-1"?>
<kehys>
	<yleinen>
		<sanomatyyppi>VIRHE</sanomatyyppi>
		<virhe>
			<virheluokka>halytys</virheluokka>
			<virhekoodi>103</virhekoodi>
			<virheselite>Ajoneuvoa ei löytynyt tietokannasta (eli Trafi-kansiosta)</virheselite>
		</virhe>
	</yleinen>
	<sanoma></sanoma>
</kehys>`;

const resultsCollector = new ResultsCollector(RESPONSE_PATH);
const app = express();

function onResponse (file) {
	const filepath = path.join(RESPONSE_PATH, file);
	const exist = fs.existsSync(filepath);

	return {
		add (watcher = false) {
			if (exist) {
				const response = fs.readFileSync(filepath);

				if (response) {
					const { ctimeMs, mtimeMs } = fs.statSync(filepath);

					const status = resultsCollector.addOrUpdate(
						file,
						iconv.decode(response, 'latin1'),
						Math.max(ctimeMs, mtimeMs),
						watcher
					);

					if (watcher) {
						app.emit('response:add', {
							success: Boolean(status),
							value: resultsCollector.parsed[file],
							old_key: status.replaced,
							new_key: file,
						});
					}

					if (status) {
						if (status.replaced) {
							log(`add: '${status.replaced}' replaced '${file}'\n`);
						} else {
							log(`add: '${file}'\n`);
						}
					}
				}
			}
		},
		remove (watcher = false) {
			const success = resultsCollector.remove(file);

			if (success) {
				if (watcher) {
					app.emit('response:rm', {
						success,
						file,
					});
				}

				log(`remove: ${file}\n`);
			}
		}
	}
}

function log (string) {
	process.stdout.write(string);
}

const responses = fs.readdirSync(RESPONSE_PATH);
const watcher = chokidar.watch(`${RESPONSE_PATH}/`, {
	ignoreInitial: true,
	persistent: true,
});

watcher.on('all', (event, filepath) => {
	const basename = path.basename(filepath);
	const response = onResponse(basename);

	switch (event) {
		case 'add':
		case 'change':
			response.add(true);
			break;
		case 'unlink':
			response.remove(true);
			break;
	}
});

log(`preparing responses (${responses.length}) ...\n`);

// initialize responses
_.each(responses, file => onResponse(file).add());

log('done\n');

app.use(bodyParser.raw({
	type: [
		'application/xml',
		'text/xml'
	],
	inflate: true,
	limit: '100kb',
}));

function getReport (req, res) {
	res.set('Content-Type', 'text/html').sendFile(path.resolve('./src/responses.html'));
}

function getResponse (req, res) {
	let request, json;

	if (request = req.body) {
		request = request.toString('utf8');

		res.set('Content-Type', 'text/plain');

		if (json = parser.parse(request)) {
			const hakutiedot = _.get(json, 'kehys.sanoma.ajoneuvonHakuehdot');

			if (hakutiedot) {
				res.set('Content-Type', 'application/xml; charset=ISO-8859-1');
				
				new Promise(resolve => {
					let response;

					if (response = resultsCollector.getByReg(hakutiedot.rekisteritunnus)) {
						resolve(response);
					} else if (response = resultsCollector.getByVin(hakutiedot.valmistenumero)) {
						resolve(response);
					} else {
						resolve(NO_RESPONSE);
					}
				}).then(response => {
					res.end(response, 'latin1');
				});
			}
		} else {
			process.stderr.write(`${req.ip} parse failed.\n`);
			res.end('parse failed.');
		}
	} else {
		process.stderr.write(`${req.ip} no body.\n`);
		res.end('no body.');
	}
}

function toResponseItem (response) {
	const getFromResponse = _.partial(_.get, response, _);
	
	const historia = getFromResponse('kehys.sanoma.ajoneuvontiedot.historia');
	const laaja = getFromResponse('kehys.sanoma.ajoneuvontiedot.laaja');
	const virhe = getFromResponse('kehys.yleinen.virhe');

	return {
		error: virhe,
		type: laaja ? 'Laaja' : historia ? 'Historia' : '?',
		data: laaja || historia,
	}
}

app.get('/xml/:name', (req, res) => {
	res.charset = 'ISO-8859-1';
	res.sendFile(req.params.name, {
		dotfiles: 'deny',
		root: RESPONSE_PATH,
		headers: {
			'Content-Type': 'application/xml; charset=ISO-8859-1',
		}
	});
});

app.get('/data.json', (req, res) => {
	res.send({
		responses: _.mapValues(resultsCollector.parsed, toResponseItem),
		class2text: require('./src/class2text.js'),
	});
});

app.get('/event/responses', sseExpress, (req, res) => {
	app.on('response:add', data => {
		const output = _.clone(data);

		output.value = toResponseItem(output.value);
		res.sse('add-response', output);
	});

	app.on('response:rm', data => {
		res.sse('remove-response', data);
	});
});

app.get('/report', getReport);
app.get('/', getReport);

app.post('/index.php', getResponse);
app.post('/', getResponse);

const server = http.createServer(app);

server.listen(PORT, HOST);

log(`listening to ${HOST}:${PORT}\n`);
