import { grpc } from 'workers'
import combinePaginators from '@zap/utils/pagination'

export const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * returnTimestamp - Returns invoice, payment or transaction timestamp.
 *
 * @param {object} activity Activity item
 * @returns {number} Timestamp
 */
export const returnTimestamp = activity => {
  switch (activity.type) {
    case 'transaction':
      return activity.timeStamp
    case 'invoice':
      return activity.isSettled ? activity.settleDate : activity.creationDate
    case 'payment':
      return activity.creationDate
    default:
      return null
  }
}

/**
 * addDate - Decorates activity entry with date and timestamp fields.
 *
 * @param {object} entry Activity entry
 * @returns {object} decorated activity entry
 */
export const addDate = entry => {
  const timestamp = returnTimestamp(entry)
  const d = new Date(timestamp * 1000)
  const date = d.getDate()
  return { ...entry, date: `${months[d.getMonth()]} ${date}, ${d.getFullYear()}`, timestamp }
}

/**
 * propMatches - Check whether a prop exists and contains a given search string.
 *
 * @param {string}  prop Prop name
 * @returns {boolean} Boolean indicating if the prop was found and contains the search string
 */
export const propMatches = function propMatches(prop) {
  const { item, searchTextSelector = '' } = this
  return item[prop] && item[prop].toLowerCase().includes(searchTextSelector.toLowerCase())
}

/**
 * groupAll - Sorts data by date and inserts grouping titles.
 *
 * @param {any[]} data Items to group
 * @returns {any[]} Grouped items
 */
export function groupActivity(data) {
  return data
    .sort((a, b) => b.timestamp - a.timestamp)
    .reduce((acc, next) => {
      const prev = acc[acc.length - 1]
      // check if need insert a group title
      if (prev) {
        if (prev.date !== next.date) {
          acc.push({ title: next.date })
        }
      } else {
        // This is a very first row. Insert title here too
        acc.push({ title: next.date })
      }
      acc.push(next)
      return acc
    }, [])
}

/**
 * applySearch - Filter activity list by checking various properties against a given search string.
 *
 * @param {any[]}  data Activity item list
 * @param {string} searchTextSelector Search text
 * @returns {any[]}  Filtered activity list
 */
export const applySearch = (data, searchTextSelector) => {
  if (!searchTextSelector) {
    return data
  }

  return data.filter(item => {
    // Check basic props for a match.
    const hasPropMatch = [
      'date',
      'type',
      'memo',
      'txHash',
      'paymentHash',
      'paymentPreimage',
      'paymentRequest',
      'destNodePubkey',
      'destNodeAlias',
    ].some(propMatches, { item, searchTextSelector })

    // Check every destination address.
    const hasAddressMatch =
      item.destAddresses && item.destAddresses.find(addr => addr.includes(searchTextSelector))

    // Include the item if at least one search criteria matches.
    return hasPropMatch || hasAddressMatch
  })
}

/**
 * prepareData - Filter dataset with search criteria.
 *
 * @param {any[]}  data Activity item list
 * @param {string} searchText Search text
 * @returns {any[]} Filtered dataset
 */
export const prepareData = (data, searchText) => {
  return groupActivity(applySearch(data, searchText))
}

/**
 * createActivityPaginator - Creates activity paginator object.
 *
 * @returns {Function} Paginator
 */
export const createActivityPaginator = () => {
  const fetchInvoices = async (pageSize, offset) => {
    const { invoices, firstIndexOffset } = await grpc.services.Lightning.listInvoices({
      numMaxInvoices: pageSize,
      indexOffset: offset,
      reversed: true,
    })
    return { items: invoices, offset: parseInt(firstIndexOffset || 0, 10) }
  }

  const fetchPayments = async (pageSize, offset) => {
    const { payments, firstIndexOffset } = await grpc.services.Lightning.listPayments({
      maxPayments: pageSize,
      indexOffset: offset,
      reversed: true,
    })
    return { items: payments, offset: parseInt(firstIndexOffset || 0, 10) }
  }

  const fetchTransactions = async () => {
    const { transactions } = await grpc.services.Lightning.getTransactions()
    return { items: transactions, offset: 0 }
  }

  const getTimestamp = item =>
    parseInt(item.timeStamp, 10) || parseInt(item.settleDate, 10) || parseInt(item.creationDate, 10)

  const itemSorter = (a, b) => getTimestamp(b) - getTimestamp(a)

  return combinePaginators(itemSorter, fetchInvoices, fetchPayments, fetchTransactions)
}

/**
 * getItemType - Determine an activity item type.
 *
 * @param {object} item Activity item
 * @returns {string} Item type
 */
export const getItemType = item => {
  if (item.destAddresses) {
    return 'transactions'
  }
  if ('addIndex' in item) {
    return 'invoices'
  }
  return 'payments'
}
