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

const noResponse = `<?xml version="1.0" encoding="ISO-8859-1"?>
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

const app = express();

function onResponse (file) {
	const filepath = path.join(responsesPath, file);
	const exist = fs.existsSync(filepath);

	return {
		add (emit = false) {
			if (exist) {
				const response = fs.readFileSync(filepath);

				if (response) {
					const status = ResultsCollector.addOrUpdate(file, iconv.decode(response, 'latin1'));

					if (emit) {
						app.emit('response:add', {
							success: Boolean(status),
							value: ResultsCollector.parsed[file],
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
		remove (emit = false) {
			const success = ResultsCollector.remove(file);

			if (success) {
				if (emit) {
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

const responsesPath = path.resolve('./responses');

const responses = fs.readdirSync(responsesPath);
const watcher = chokidar.watch(`${responsesPath}/`, {
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
	type: 'text/xml',
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
				const reg = hakutiedot.rekisteritunnus;
				const vin = hakutiedot.valmistenumero;
				let response;

				res.set('Content-Type', 'application/xml');

				if (response = ResultsCollector.getByReg(reg)) {
					res.end(response);
				} else if (response = ResultsCollector.getByVin(vin)) {
					res.end(response);
				} else {
					res.end(noResponse);
				}
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
	const historia = _.get(response, 'kehys.sanoma.ajoneuvontiedot.historia');
	const laaja = _.get(response, 'kehys.sanoma.ajoneuvontiedot.laaja');
	const virhe = _.get(response, 'kehys.yleinen.virhe');

	return {
		error: virhe,
		type: laaja ? 'Laaja' : historia ? 'Historia' : '?',
		data: laaja || historia,
	}
}

app.get('/xml/:name', (req, res) => {
	res.sendFile(req.params.name, {
		dotfiles: 'deny',
		root: responsesPath,
		headers: {
			'Content-Type': 'application/xml; charset=ISO-8859-1',
		}
	});
});

app.get('/data.json', (req, res) => {
	res.send({
		responses: _.mapValues(ResultsCollector.parsed, toResponseItem),
		class2text: require('./src/class2text.js'),
	});
});

app.get('/event/responses', sseExpress, (req, res) => {
	app.on('response:add', data => {
		res.sse('add-response', _.assign(data, {
			value: toResponseItem(data.value),
		}));
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
