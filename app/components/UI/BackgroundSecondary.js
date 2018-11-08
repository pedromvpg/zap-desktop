import React from 'react'
import { Box } from 'rebass'

/**
 * @render react
 * @name BackgroundSecondary
 * @example
 * <BackgroundSecondary />
 */
class BackgroundSecondary extends React.Component {
  render() {
    return <Box bg="secondaryColor" color="primaryText" {...this.props} />
  }
}

export default BackgroundSecondary
