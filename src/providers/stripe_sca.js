const libraryPaths = [
  'https://js.stripe.com/v3/'
];
const DOMAIN = "https://app.thebookingfactory.com";

let form, submit, closeBTN;
let loadingInterval = null;
let gatewaySettings = {};
let modal;
let stripe;
let elements;
let card;

function _injectLibraryScripts() {
  libraryPaths.forEach((path) => {
    _injectLibraryScript(path);
  })
}

function _injectLibraryScript(path) {
  let head = document.getElementsByTagName('head').item(0);
  let script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', path);
  head.appendChild(script);
}

function _drawForm() {
  const { postfix, showSubmitButton, target } = gatewaySettings;

  let body = document.getElementsByTagName('body').item(0);
  let div  = target ? document.getElementById(target) : document.createElement('div');
  let close_button = showSubmitButton === false ? '' : `<button id="close-form-${postfix}" class="multiple_card_tokenization__close-button"></button>`;
  let submit_button = showSubmitButton === false ? '' : `<div class="multiple_card_tokenization__button-container"><input type="submit" class="multiple_card_tokenization__button button--small button--green" value="Save Card Details" id="submit_${postfix}"/></div>`;

  div.innerHTML = `
    <div class="multiple_card_tokenization__modal_overlay multiple_card_tokenization__modal_overlay__stripe" style="display: none;" id="modal_${postfix}">
      <div class="multiple_card_tokenization__modal_window">
        <div class="multiple_card_tokenization__demo-frame">
          <legend class="multiple_card_tokenization__form-legend">
            Card Details
            ${close_button}
          </legend>
          <form action="/" method="post" id="stripe_card_form_${postfix}">
            <div class="form-row">
              <div class="multiple_card_tokenization__field-container">
                <label class="multiple_card_tokenization__hosted-fields--label" for="cardholder-name_${postfix}">Cardholder Name</label>
                <input type="text" id="cardholder-name_${postfix}" class="multiple_card_tokenization__hosted-field" placeholder="CARDHOLDER NAME" />
              </div>
              <div class="multiple_card_tokenization__field-container">
                <label class="multiple_card_tokenization__hosted-fields--label">Card Data</label>
                <div id="card-element"></div>
                <div id="card-errors" role="alert"></div>
              </div>
            </div>

            ${submit_button}
          </form>
        <div>
      </div>
    </div>
  `;

  if (!target) {body.appendChild(div);}

  modal = document.getElementById(`modal_${postfix}`);
}

function _checkLoading() {
  if (window.Stripe) {
    _initializeScripts();
    clearInterval(loadingInterval);
  }
}

function _initializeScripts() {
  const { postfix, connection, showSubmitButton } = gatewaySettings;
  const { token } = connection;

  form = document.querySelector(`#stripe_card_form_${postfix}`);

  if (showSubmitButton === undefined || !showSubmitButton === false) {
    submit = document.querySelector(`#submit_${postfix}`);
    closeBTN = document.querySelector(`#close-form-${postfix}`);
    closeBTN.addEventListener('click', hideForm.bind(this), false);
  }

  form.addEventListener('submit', onSubmit.bind(this), false);
  stripe = Stripe(token);
  elements = stripe.elements();

  var style = {
    base: {
      marginTop: '5px',
      fontSize: '14px',
      lineHeight: '24px'
    }
  };

  var cardSettings = {
    hidePostalCode: true
  };

  card = elements.create('card', {style: style, card: cardSettings});
  card.mount('#card-element');
  card.addEventListener('change', function(event) {
    var displayError = document.getElementById('card-errors');
    if (event.error) {
      displayError.textContent = event.error.message;
    } else {
      displayError.textContent = '';
    }
  });
}

function preparePaymentIntentForBooking(bookingToken, paymentMethodId) {
  return fetch(`${DOMAIN}/api/public/v1/prepare_online_payment/stripe_sca?token=${bookingToken}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payment_method_id: paymentMethodId
    })
  });
}

function prepareIntent(amount, apiKey, paymentMethodId) {
  return fetch(`${DOMAIN}/api/public/v1/prepare_online_payment/stripe_sca`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Token': apiKey,
    },
    body: JSON.stringify({
      amount: amount,
      payment_method_id: paymentMethodId
    })
  });
}

function onSubmit(event) {
  event.preventDefault();

  stripe.createPaymentMethod('card', card).then(function(result) {
    if (result.error) {
      let message = result.error.message;
      if (message === "Missing required param: card[exp_year].") {
        message = 'Could not find payment information';
      }

      if (gatewaySettings.onError && typeof(gatewaySettings.onError) === 'function') {
        gatewaySettings.onError(message);
      } else {
        alert(message);
      }
    } else {
      const action = gatewaySettings.bookingToken
        ? preparePaymentIntentForBooking(gatewaySettings.bookingToken, result.paymentMethod.id)
        : prepareIntent(gatewaySettings.customer_data.amount, gatewaySettings.apiKey, result.paymentMethod.id);

        action
        .then((response) => {
          if (response.status !== 200) {
            console.error(response);
            alert('Something went wrong');
            throw new Error('Something went wrong');
          }

          return response.json();
        })
        .then((response) => {
          if (gatewaySettings.onTokenize && typeof(gatewaySettings.onTokenize) === 'function') {
            // TODO: do we need data here for online payment gateways?
            gatewaySettings.onTokenize(
              '',
              '',
              '',
              {
                clientSecret: response.client_secret
              }
            );
          }

          hideForm();
        });
    }
  });
}

function showForm (customer_information) {
  gatewaySettings.customer_data = customer_information;
  modal.style.display = 'block';
}

function hideForm () {
  if (gatewaySettings.showSubmitButton === undefined || !gatewaySettings.showSubmitButton === false) {
    modal.style.display = 'none';
  }
}

// TODO: need to know initial payment here
function tokenize (customerInformation) {
  gatewaySettings.customer_data = customerInformation;
  onSubmit({preventDefault: function() {}});
}

export default class StripeSca  {
  constructor(settings) {
    gatewaySettings = {
      ...settings,
      postfix: (new Date()).getTime()
    };

    _injectLibraryScripts();
    _drawForm();
    loadingInterval = setInterval(_checkLoading.bind(this), 100);
  }

  showForm = showForm;
  hideForm = hideForm;
  tokenize = tokenize;
}
