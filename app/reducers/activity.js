import { createSelector } from 'reselect'
import { decodePayReq } from 'lib/utils/crypto'

import { openModal, closeModal } from './modal'
import { fetchDescribeNetwork } from './network'
import { fetchTransactions, transactionsSelectors } from './transaction'
import { fetchPayments } from './payment'
import { fetchInvoices } from './invoice'
import { fetchBalance } from './balance'
import { fetchChannels } from './channels'

// ------------------------------------
// Initial State
// ------------------------------------
const initialState = {
  filter: 'ALL_ACTIVITY',
  filters: [
    { key: 'ALL_ACTIVITY', name: 'All' },
    { key: 'SENT_ACTIVITY', name: 'Sent' },
    { key: 'REQUESTED_ACTIVITY', name: 'Requested' },
    { key: 'PENDING_ACTIVITY', name: 'Pending' },
    { key: 'INTERNAL_ACTIVITY', name: 'Internal' }
  ],
  modal: {
    itemType: null,
    itemId: null
  },
  searchActive: false,
  searchText: '',
  showExpiredRequests: false
}

// ------------------------------------
// Constants
// ------------------------------------
export const SHOW_ACTIVITY_MODAL = 'SHOW_ACTIVITY_MODAL'
export const HIDE_ACTIVITY_MODAL = 'HIDE_ACTIVITY_MODAL'
export const CHANGE_FILTER = 'CHANGE_FILTER'
export const TOGGLE_EXPIRED_REQUESTS = 'TOGGLE_EXPIRED_REQUESTS'
export const UPDATE_SEARCH_ACTIVE = 'UPDATE_SEARCH_ACTIVE'
export const UPDATE_SEARCH_TEXT = 'UPDATE_SEARCH_TEXT'

// ------------------------------------
// Actions
// ------------------------------------
export function showActivityModal(itemType, itemId) {
  return dispatch => {
    dispatch({ type: SHOW_ACTIVITY_MODAL, itemType, itemId })
    dispatch(openModal('ACTIVITY_MODAL'))
  }
}

export function hideActivityModal() {
  return dispatch => {
    dispatch({ type: HIDE_ACTIVITY_MODAL })
    dispatch(closeModal('ACTIVITY_MODAL'))
  }
}

export function changeFilter(filter) {
  return {
    type: CHANGE_FILTER,
    filter
  }
}

export function updateSearchActive(searchActive) {
  return {
    type: UPDATE_SEARCH_ACTIVE,
    searchActive
  }
}

export function updateSearchText(searchText) {
  return {
    type: UPDATE_SEARCH_TEXT,
    searchText
  }
}

export function toggleExpiredRequests() {
  return {
    type: TOGGLE_EXPIRED_REQUESTS
  }
}

/**
 * Fetches user activity history. Which includes:
 * Balance
 * Payments
 * Invoices
 * Transactions
 */
export const fetchActivityHistory = () => dispatch => {
  dispatch(fetchDescribeNetwork())
  dispatch(fetchChannels())
  dispatch(fetchBalance())
  dispatch(fetchPayments())
  dispatch(fetchInvoices())
  dispatch(fetchTransactions())
}

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [SHOW_ACTIVITY_MODAL]: (state, { itemType, itemId }) => ({
    ...state,
    modal: { itemType, itemId }
  }),
  [HIDE_ACTIVITY_MODAL]: state => ({ ...state, modal: { itemType: null, itemId: null } }),
  [CHANGE_FILTER]: (state, { filter }) => ({ ...state, filter }),
  [TOGGLE_EXPIRED_REQUESTS]: state => ({
    ...state,
    showExpiredRequests: !state.showExpiredRequests
  }),

  [UPDATE_SEARCH_ACTIVE]: (state, { searchActive }) => ({ ...state, searchActive }),
  [UPDATE_SEARCH_TEXT]: (state, { searchText }) => ({ ...state, searchText })
}

// ------------------------------------
// Selectors
// ------------------------------------
const activitySelectors = {}
const filtersSelector = state => state.activity.filters
const filterSelector = state => state.activity.filter
const searchSelector = state => state.activity.searchText
const showExpiredSelector = state => state.activity.showExpiredRequests
const paymentsSelector = state => state.payment.payments
const paymentsSendingSelector = state => state.payment.paymentsSending
const invoicesSelector = state => state.invoice.invoices
const transactionsSelector = state => transactionsSelectors.transactionsSelector(state)
const transactionsSendingSelector = state => state.transaction.transactionsSending
const modalItemTypeSelector = state => state.activity.modal.itemType
const modalItemIdSelector = state => state.activity.modal.itemId

const invoiceExpired = invoice => {
  const expiresAt = parseInt(invoice.creation_date, 10) + parseInt(invoice.expiry, 10)
  return expiresAt < Math.round(new Date() / 1000)
}

/**
 * Map sending payments to something that looks like normal payments.
 */
const paymentsSending = createSelector(
  paymentsSendingSelector,
  paymentsSending => {
    const payments = paymentsSending.map(payment => {
      const invoice = decodePayReq(payment.paymentRequest)
      return {
        type: 'payment',
        creation_date: payment.timestamp,
        value: payment.amt,
        path: [invoice.payeeNodeKey],
        payment_hash: invoice.tags.find(t => t.tagName === 'payment_hash').data,
        sending: true,
        status: payment.status,
        error: payment.error
      }
    })
    return payments
  }
)

/**
 * Map sending transactions to something that looks like normal transactions.
 */
const transactionsSending = createSelector(
  transactionsSendingSelector,
  transactionsSending => {
    const transactions = transactionsSending.map(transaction => {
      return {
        type: 'transaction',
        time_stamp: transaction.timestamp,
        amount: transaction.amount,
        sending: true,
        status: transaction.status,
        error: transaction.error
      }
    })
    return transactions
  }
)

activitySelectors.activityModalItem = createSelector(
  paymentsSelector,
  invoicesSelector,
  transactionsSelector,
  modalItemTypeSelector,
  modalItemIdSelector,
  (payments, invoices, transactions, itemType, itemId) => {
    switch (itemType) {
      case 'INVOICE':
        return invoices.find(invoice => invoice.payment_request === itemId)
      case 'TRANSACTION':
        return transactions.find(transaction => transaction.tx_hash === itemId)
      case 'PAYMENT':
        return payments.find(payment => payment.payment_hash === itemId)
      default:
        return null
    }
  }
)

// helper function that returns invoice, payment or transaction timestamp
function returnTimestamp(activity) {
  switch (activity.type) {
    case 'transaction':
      return activity.time_stamp
    case 'invoice':
      return activity.settled ? activity.settle_date : activity.creation_date
    case 'payment':
      return activity.creation_date
  }
}

// getMonth() returns the month in 0 index (0 for Jan), so we create an arr of the
// string representation we want for the UI
const months = [
  'Jan',
  'Feb',
  'Mar',
  'April',
  'May',
  'June',
  'July',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

/**
 * Sorts data by date and inserts grouping titles
 * @param {*} data
 */
function groupAll(data) {
  // according too https://stackoverflow.com/a/11252167/3509860
  // this provides an accurate measurement including handling of DST
  const daysBetween = (t1, t2) => Math.round((t2 - t1) / 86400)

  const createTitle = entry => {
    const d = new Date(returnTimestamp(entry) * 1000)
    const date = d.getDate()
    return `${months[d.getMonth()]} ${date}, ${d.getFullYear()}`
  }

  return data
    .sort((a, b) => returnTimestamp(b) - returnTimestamp(a))
    .reduce((acc, next) => {
      const prev = acc[acc.length - 1]
      //check if need insert a group title
      if (prev) {
        const days = daysBetween(returnTimestamp(next), returnTimestamp(prev))
        if (days >= 1) {
          acc.push({ title: createTitle(next) })
        }
      } else {
        //This is a very first row. Insert title here too
        acc.push({ title: createTitle(next) })
      }
      acc.push(next)
      return acc
    }, [])
}

const allActivity = createSelector(
  searchSelector,
  paymentsSending,
  transactionsSending,
  paymentsSelector,
  transactionsSelector,
  invoicesSelector,
  showExpiredSelector,
  (
    searchText,
    paymentsSending,
    transactionsSending,
    payments,
    transactions,
    invoices,
    showExpired
  ) => {
    const filteredInvoices = invoices.filter(
      invoice => showExpired || invoice.settled || !invoiceExpired(invoice)
    )

    const allData = [
      ...paymentsSending,
      ...transactionsSending,
      ...payments,
      ...transactions.filter(transaction => !transaction.isFunding && !transaction.isClosing),
      ...filteredInvoices
    ]

    if (!searchText) {
      return groupAll(allData)
    }

    const searchedArr = allData.filter(
      tx =>
        (tx.tx_hash && tx.tx_hash.includes(searchText)) ||
        (tx.payment_hash && tx.payment_hash.includes(searchText)) ||
        (tx.payment_request && tx.payment_request.includes(searchText))
    )

    return groupAll(searchedArr)
  }
)

const invoiceActivity = createSelector(
  invoicesSelector,
  showExpiredSelector,
  (invoices, showExpired) =>
    groupAll(invoices.filter(invoice => showExpired || invoice.settled || !invoiceExpired(invoice)))
)

const sentActivity = createSelector(
  paymentsSending,
  transactionsSending,
  paymentsSelector,
  transactionsSelector,
  (paymentsSending, transactionsSending, payments, transactions) => {
    return groupAll([
      ...paymentsSending,
      ...transactionsSending,
      ...payments,
      ...transactions.filter(transaction => !transaction.received)
    ])
  }
)

const pendingActivity = createSelector(
  invoicesSelector,
  invoices => groupAll(invoices.filter(invoice => !invoice.settled && !invoiceExpired(invoice)))
)

const internalActivity = createSelector(
  searchSelector,
  transactionsSelector,
  (searchText, transactions) => {
    const allData = transactions.filter(
      transaction => transaction.isFunding || transaction.isClosing
    )

    if (!searchText) {
      return groupAll(allData)
    }

    const searchedArr = allData.filter(tx => tx.tx_hash && tx.tx_hash.includes(searchText))

    return groupAll(searchedArr)
  }
)

const FILTERS = {
  ALL_ACTIVITY: allActivity,
  SENT_ACTIVITY: sentActivity,
  REQUESTED_ACTIVITY: invoiceActivity,
  PENDING_ACTIVITY: pendingActivity,
  INTERNAL_ACTIVITY: internalActivity
}

activitySelectors.currentActivity = createSelector(
  filterSelector,
  filter => FILTERS[filter]
)

activitySelectors.nonActiveFilters = createSelector(
  filtersSelector,
  filterSelector,
  (filters, filter) => filters.filter(f => f.key !== filter)
)

activitySelectors.showExpiredToggle = createSelector(
  filterSelector,
  filter => filter === 'REQUESTED_ACTIVITY' || filter === 'ALL_ACTIVITY'
)

export { activitySelectors }

// ------------------------------------
// Reducer
// ------------------------------------
export default function activityReducer(state = initialState, action) {
  const handler = ACTION_HANDLERS[action.type]

  return handler ? handler(state, action) : state
}
