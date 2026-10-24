# Synthetic lead prioritisation

**Demo model — not validated on your agency.** This is a functional model demonstration, not a validated recommendation for live agency decisions.

## Reproduce

Use Python 3.12, in a virtual environment:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r ml/requirements.txt
python ml/train.py
npm test
```

The script creates 8,000 synthetic rows with NumPy seed 20261024 and a fictional logistic outcome process. A stratified split with seed 42 reserves 2,000 rows for evaluation. Standardisation is fitted on the 6,000 training rows only. Scikit-learn logistic regression (C=1, max_iter=1000) fits only training rows. `evaluation.json` contains the actual held-out synthetic metrics from that run; `parity.json` has 80 Python prediction fixtures. No figures are asserted for real customers or agencies.

`model.json` exports feature ordering, ranges, training means/scales, coefficients, intercept and version. `src/lib/model.ts` implements exactly the exported standardised logistic inference. Automated tests compare every fixture within 1e-12 probability. Runtime Python is not required by the application. Regeneration is explicit, never triggered by CSV imports or live data.

| Feature | Source / supported range |
|---|---|
| Budget fit | Budget per person ÷ quoted price per person, 0.25–2; both explicitly collected |
| Days to departure | Travel start minus enquiry date, 0–365 days; frozen enquiry-date reference, not a daily countdown |
| Travellers | Explicit integer count, 1–20 |
| First response hours | Explicit elapsed response time, 0–168 hours; blank until known |
| Repeat customer | Explicit yes/no, unknown is not silently interpreted as no |
| Itinerary requested | Explicit yes/no; unknown is not scored |

Missing values or unsupported inputs return **Not scored** with a reason. Eligible records store score, coefficient-based explanation, version and scoring timestamp whenever created/imported/edited/quoted. High priority ≥0.65; medium ≥0.35 and <0.65; low <0.35. These cutoffs are demonstration choices, not calibrated agency policy. Closing stage does not change a score automatically; the priority table shows open enquiries.

Explanations show the largest absolute standardised coefficient terms relative to the synthetic training mean. They are model associations, never causal explanations. Outcomes, stages, receipts and supplier costs are not model features. A later score can use updated values that are known when the record is edited; this model is not an initial-contact-only prediction. It must not be evaluated as an initial-contact forecast without an appropriate point-in-time dataset.

## Limitations

Synthetic input distributions and outcome rules reflect invented assumptions. Held-out synthetic accuracy/AUC/Brier scores test the reproduction pipeline, not real-world calibration, fairness, discrimination or utility. No external validation, measured revenue lift, causal business effect or automatic retraining exists. Before a real model rollout: collect consented, timestamped data; define the prediction point; remove leakage; use temporal and agency holdouts; evaluate calibration, subgroup performance and drift; obtain human review; and choose appropriate thresholds and monitoring.
