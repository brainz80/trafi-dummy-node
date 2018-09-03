const _ = require('lodash');
const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const Handlebars = require('handlebars');
const http = require('http');
const iconv = require('iconv-lite');
const moment = require('moment');
const parser = require('fast-xml-parser');
const path = require('path');

const HOST = '0.0.0.0';
const PORT = 8080;

const class2text = require('./src/class2text.js');
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

const basePath = './responses';

const responses = fs.readdirSync(basePath);

if (responses) {
	process.stdout.write(`preparing responses (${responses.length}) ... `);

	// initialize responses
	_.each(responses, file => {
		const response = fs.readFileSync(path.join(basePath, file));

		if (file && response) {
			const text = iconv.decode(response, 'latin1');
			ResultsCollector.addOrUpdate(file, text);
		}
	});

	process.stdout.write('done\n');

	const app = express();
	app.use(bodyParser.raw({
		type: 'text/xml',
		inflate: true,
		limit: '100kb',
	}));

	function getReport (req, res) {
		res.set('Content-Type', 'text/html');

		Handlebars.registerHelper('class2text', value => {
			if (value) {
				return class2text[value] || value;
			} else {
				return Handlebars.helpers.default();
			}
		});
		Handlebars.registerHelper('default', value => value || '--');
		Handlebars.registerHelper ('date', value => {
			const m = moment(value, 'YYYYMMDD');
			if (m.isValid()) {
				return new Handlebars.SafeString(`<span>${ m.format('DD.MM.YYYY') } (${ m.fromNow() })</span>`);
			} else if (value) {
				const year = String.prototype.substring.call(value, 0, 4);
				return Handlebars.helpers.date(`${year}0101`);
			} else {
				return Handlebars.helpers.default();
			}
		});
		Handlebars.registerHelper('xmllink', file => {
			file = Handlebars.escapeExpression(file);
			return new Handlebars.SafeString(`<a target="_blank" href="/xml/${file}">${file}</a>`);
		});

		const template = Handlebars.compile( fs.readFileSync('./src/responses.html', 'utf8') );

		res.end(template({
			items: _.mapValues(ResultsCollector.parsed, root => {
				const historia = _.get(root, 'kehys.sanoma.ajoneuvontiedot.historia');
				const laaja = _.get(root, 'kehys.sanoma.ajoneuvontiedot.laaja');
				const virhe = _.get(root, 'kehys.yleinen.virhe');

				return {
					error: virhe,
					type: laaja ? 'Laaja' : historia ? 'Historia' : '?',
					data: laaja || historia,
				}
			}),
		}));
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

	app.get('/xml/:name', (req, res) => {
		res.sendFile(req.params.name, {
			dotfiles: 'deny',
			root: basePath,
			headers: {
				'Content-Type': 'application/xml; charset=ISO-8859-1',
			}
		});
	});

	app.get('/report', getReport);
	app.get('/', getReport);

	app.post('/index.php', getResponse);
	app.post('/', getResponse);

	const server = http.createServer(app);

	server.listen(PORT, HOST);

	process.stdout.write(`listening to ${HOST}:${PORT}\n`);
}
